import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

/**
 * Outbound HTTP for user-configured URLs (workflow webhooks) with SSRF protection:
 * - the hostname is resolved once and every address is checked against private ranges;
 * - the connection is pinned to the checked IP (no second DNS lookup → no rebinding);
 * - redirects are never followed; 10 s timeout; the response body is discarded.
 */

const blocked = new net.BlockList();
// IPv4
blocked.addSubnet('0.0.0.0', 8, 'ipv4'); // "this network"
blocked.addSubnet('10.0.0.0', 8, 'ipv4');
blocked.addSubnet('100.64.0.0', 10, 'ipv4'); // CGNAT
blocked.addSubnet('127.0.0.0', 8, 'ipv4');
blocked.addSubnet('169.254.0.0', 16, 'ipv4'); // link-local (incl. cloud metadata)
blocked.addSubnet('172.16.0.0', 12, 'ipv4');
blocked.addSubnet('192.0.0.0', 24, 'ipv4');
blocked.addSubnet('192.168.0.0', 16, 'ipv4');
blocked.addSubnet('198.18.0.0', 15, 'ipv4'); // benchmarking
blocked.addSubnet('224.0.0.0', 4, 'ipv4'); // multicast
blocked.addSubnet('240.0.0.0', 4, 'ipv4'); // reserved + broadcast
// IPv6
blocked.addAddress('::', 'ipv6');
blocked.addAddress('::1', 'ipv6');
blocked.addSubnet('fc00::', 7, 'ipv6'); // unique local
blocked.addSubnet('fe80::', 10, 'ipv6'); // link-local
blocked.addSubnet('ff00::', 8, 'ipv6'); // multicast
blocked.addSubnet('64:ff9b::', 96, 'ipv6'); // NAT64 (maps onto IPv4)

export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return true;
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped?.[1]) return blocked.check(mapped[1], 'ipv4');
    return blocked.check(address, 'ipv6');
  }
  return blocked.check(address, 'ipv4');
}

export type Resolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
const systemResolver: Resolver = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

export interface SafePostOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Test seams. */
  resolver?: Resolver;
  isBlocked?: (address: string) => boolean;
}

export interface SafePostResult {
  ok: boolean;
  status: number | null;
  message: string;
}

export async function safePost(
  rawUrl: string,
  payload: unknown,
  opts: SafePostOptions = {},
): Promise<SafePostResult> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, status: null, message: 'Only http(s) URLs are supported' };
  }
  if (url.username || url.password) {
    return { ok: false, status: null, message: 'URLs with embedded credentials are not allowed' };
  }
  const checkBlocked = opts.isBlocked ?? isBlockedAddress;
  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  let addresses: Array<{ address: string; family: number }>;
  if (net.isIP(hostname)) {
    addresses = [{ address: hostname, family: net.isIP(hostname) }];
  } else {
    try {
      addresses = await (opts.resolver ?? systemResolver)(hostname);
    } catch {
      return { ok: false, status: null, message: `Could not resolve ${hostname}` };
    }
  }
  if (addresses.length === 0)
    return { ok: false, status: null, message: `Could not resolve ${hostname}` };
  if (addresses.some((a) => checkBlocked(a.address))) {
    return {
      ok: false,
      status: null,
      message: 'Blocked: the URL points to a private or internal network address',
    };
  }
  const pinned = addresses[0]!;

  const body = JSON.stringify(payload);
  const client = url.protocol === 'https:' ? https : http;
  const timeoutMs = opts.timeoutMs ?? 10_000;

  return new Promise<SafePostResult>((resolve) => {
    const req = client.request(
      {
        protocol: url.protocol,
        hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        servername: net.isIP(hostname) ? undefined : hostname, // SNI + certificate check against the real name
        // Pin the connection to the address we validated.
        lookup: (_host, options, cb) => {
          if ((options as { all?: boolean }).all) {
            (cb as unknown as (e: null, a: Array<{ address: string; family: number }>) => void)(
              null,
              [pinned],
            );
          } else {
            cb(null, pinned.address, pinned.family);
          }
        },
        headers: {
          ...opts.headers,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'user-agent': 'LeadOS-Webhook/1.0',
        },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        res.resume(); // discard body
        if (status >= 300 && status < 400) {
          resolve({
            ok: false,
            status,
            message: `Received redirect (${status}); redirects are not followed`,
          });
        } else if (status >= 200 && status < 300) {
          resolve({ ok: true, status, message: `Delivered (HTTP ${status})` });
        } else {
          resolve({ ok: false, status, message: `Endpoint responded with HTTP ${status}` });
        }
      },
    );
    // Overall deadline (the socket `timeout` option only covers idle time).
    const deadline = setTimeout(() => req.destroy(new Error('timeout')), timeoutMs);
    req.on('close', () => clearTimeout(deadline));
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) =>
      resolve({
        ok: false,
        status: null,
        message:
          err.message === 'timeout'
            ? `Timed out after ${timeoutMs / 1000} s`
            : `Request failed: ${err.message}`,
      }),
    );
    req.end(body);
  });
}
