import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Lightweight i18n (no dependency). Translations live in a flat key→string map
 * per locale. Missing keys fall back to English, then to the key itself.
 * Supports simple {var} interpolation.
 */
export type Locale = 'en' | 'hi' | 'es';

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'es', label: 'Español' },
];

type Dict = Record<string, string>;

const en: Dict = {
  'nav.dashboard': 'Dashboard',
  'nav.reports': 'Reports',
  'nav.leads': 'Leads',
  'nav.contacts': 'Contacts',
  'nav.pipeline': 'Pipeline',
  'nav.tasks': 'Tasks',
  'nav.inbox': 'Inbox',
  'nav.workflows': 'Workflows',
  'nav.simulator': 'Social Simulator',
  'nav.integrations': 'Integrations',
  'nav.team': 'Team',
  'nav.billing': 'Billing',
  'nav.apiDocs': 'API Docs',
  'nav.superAdmin': 'Super Admin',
  'nav.audit': 'Audit Log',
  'action.signOut': 'Sign out',
  'action.new': 'New',
  'action.search': 'Search',
  'dashboard.title': 'Dashboard',
  'dashboard.subtitle': 'Your organization at a glance.',
  'dashboard.leads': 'Leads',
  'dashboard.deals': 'Deals',
  'dashboard.openTasks': 'Open Tasks',
  'dashboard.contacts': 'Contacts',
  'dashboard.pipelineValue': 'Open Pipeline Value',
  'dashboard.wonValue': 'Won Value',
  'dashboard.recentActivity': 'Recent Activity',
  'common.loading': 'Loading…',
  'common.theme': 'Theme',
  'common.language': 'Language',
  'common.search': 'Search',
  'common.status': 'Status',
  'common.source': 'Source',
  'common.name': 'Name',
  'common.email': 'Email',
  'common.phone': 'Phone',
  'common.created': 'Created',
  'common.allStatuses': 'All statuses',
  'leads.title': 'Leads',
  'leads.subtitle': 'Capture and manage every prospect.',
  'leads.new': 'New Lead',
  'leads.scoreAll': 'Score all leads',
  'leads.export': 'Export CSV',
  'leads.import': 'Import CSV',
  'leads.empty': 'No leads yet.',
  'leads.score': 'Score',
  'leads.contact': 'Contact',
  'tasks.title': 'Tasks & Follow-ups',
  'tasks.subtitle': 'Never miss a follow-up.',
  'tasks.new': 'New Task',
  'tasks.empty': 'No tasks yet.',
  'tasks.priority': 'Priority',
  'tasks.due': 'Due',
  'pipeline.title': 'Pipeline',
  'pipeline.new': 'New Deal',
  'pipeline.totalValue': 'Total open value',
  'billing.title': 'Billing & Plan',
  'auth.welcome': 'Welcome back',
  'auth.signin': 'Sign in',
  'auth.signingIn': 'Signing in…',
};

const hi: Dict = {
  'nav.dashboard': 'डैशबोर्ड',
  'nav.reports': 'रिपोर्ट',
  'nav.leads': 'लीड्स',
  'nav.contacts': 'संपर्क',
  'nav.pipeline': 'पाइपलाइन',
  'nav.tasks': 'कार्य',
  'nav.inbox': 'इनबॉक्स',
  'nav.workflows': 'वर्कफ़्लो',
  'nav.simulator': 'सोशल सिम्युलेटर',
  'nav.integrations': 'इंटीग्रेशन',
  'nav.team': 'टीम',
  'nav.billing': 'बिलिंग',
  'nav.apiDocs': 'एपीआई डॉक्स',
  'nav.superAdmin': 'सुपर एडमिन',
  'nav.audit': 'ऑडिट लॉग',
  'action.signOut': 'साइन आउट',
  'dashboard.title': 'डैशबोर्ड',
  'dashboard.subtitle': 'आपका संगठन एक नज़र में।',
  'dashboard.leads': 'लीड्स',
  'dashboard.deals': 'डील्स',
  'dashboard.openTasks': 'खुले कार्य',
  'dashboard.contacts': 'संपर्क',
  'dashboard.pipelineValue': 'खुला पाइपलाइन मूल्य',
  'dashboard.wonValue': 'जीता मूल्य',
  'dashboard.recentActivity': 'हाल की गतिविधि',
  'common.loading': 'लोड हो रहा है…',
  'common.theme': 'थीम',
  'common.language': 'भाषा',
  'common.search': 'खोजें',
  'common.status': 'स्थिति',
  'common.source': 'स्रोत',
  'common.name': 'नाम',
  'common.email': 'ईमेल',
  'common.phone': 'फ़ोन',
  'common.created': 'बनाया गया',
  'common.allStatuses': 'सभी स्थितियाँ',
  'leads.title': 'लीड्स',
  'leads.subtitle': 'हर संभावना को कैप्चर और प्रबंधित करें।',
  'leads.new': 'नई लीड',
  'leads.scoreAll': 'सभी लीड स्कोर करें',
  'leads.export': 'CSV निर्यात',
  'leads.import': 'CSV आयात',
  'leads.empty': 'अभी तक कोई लीड नहीं।',
  'leads.score': 'स्कोर',
  'leads.contact': 'संपर्क',
  'tasks.title': 'कार्य और फ़ॉलो-अप',
  'tasks.subtitle': 'कोई फ़ॉलो-अप न चूकें।',
  'tasks.new': 'नया कार्य',
  'tasks.empty': 'अभी तक कोई कार्य नहीं।',
  'tasks.priority': 'प्राथमिकता',
  'tasks.due': 'नियत',
  'pipeline.title': 'पाइपलाइन',
  'pipeline.new': 'नई डील',
  'pipeline.totalValue': 'कुल खुला मूल्य',
  'billing.title': 'बिलिंग और योजना',
  'auth.welcome': 'वापसी पर स्वागत है',
  'auth.signin': 'साइन इन',
  'auth.signingIn': 'साइन इन हो रहा है…',
};

const es: Dict = {
  'nav.dashboard': 'Panel',
  'nav.reports': 'Informes',
  'nav.leads': 'Prospectos',
  'nav.contacts': 'Contactos',
  'nav.pipeline': 'Embudo',
  'nav.tasks': 'Tareas',
  'nav.inbox': 'Bandeja',
  'nav.workflows': 'Flujos',
  'nav.simulator': 'Simulador Social',
  'nav.integrations': 'Integraciones',
  'nav.team': 'Equipo',
  'nav.billing': 'Facturación',
  'nav.apiDocs': 'Docs API',
  'nav.superAdmin': 'Super Admin',
  'nav.audit': 'Registro de auditoría',
  'action.signOut': 'Cerrar sesión',
  'dashboard.title': 'Panel',
  'dashboard.subtitle': 'Tu organización de un vistazo.',
  'dashboard.leads': 'Prospectos',
  'dashboard.deals': 'Negocios',
  'dashboard.openTasks': 'Tareas abiertas',
  'dashboard.contacts': 'Contactos',
  'dashboard.pipelineValue': 'Valor del embudo',
  'dashboard.wonValue': 'Valor ganado',
  'dashboard.recentActivity': 'Actividad reciente',
  'common.loading': 'Cargando…',
  'common.theme': 'Tema',
  'common.language': 'Idioma',
  'common.search': 'Buscar',
  'common.status': 'Estado',
  'common.source': 'Origen',
  'common.name': 'Nombre',
  'common.email': 'Correo',
  'common.phone': 'Teléfono',
  'common.created': 'Creado',
  'common.allStatuses': 'Todos los estados',
  'leads.title': 'Prospectos',
  'leads.subtitle': 'Captura y gestiona cada prospecto.',
  'leads.new': 'Nuevo prospecto',
  'leads.scoreAll': 'Puntuar todos',
  'leads.export': 'Exportar CSV',
  'leads.import': 'Importar CSV',
  'leads.empty': 'Aún no hay prospectos.',
  'leads.score': 'Puntuación',
  'leads.contact': 'Contacto',
  'tasks.title': 'Tareas y seguimientos',
  'tasks.subtitle': 'Nunca pierdas un seguimiento.',
  'tasks.new': 'Nueva tarea',
  'tasks.empty': 'Aún no hay tareas.',
  'tasks.priority': 'Prioridad',
  'tasks.due': 'Vence',
  'pipeline.title': 'Embudo',
  'pipeline.new': 'Nuevo negocio',
  'pipeline.totalValue': 'Valor abierto total',
  'billing.title': 'Facturación y plan',
  'auth.welcome': 'Bienvenido de nuevo',
  'auth.signin': 'Iniciar sesión',
  'auth.signingIn': 'Iniciando sesión…',
};

const DICTS: Record<Locale, Dict> = { en, hi, es };

interface I18nState {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nState | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(
    (localStorage.getItem('leados_locale') as Locale) || 'en'
  );

  function setLocale(l: Locale) {
    setLocaleState(l);
    localStorage.setItem('leados_locale', l);
    document.documentElement.setAttribute('lang', l);
  }

  useEffect(() => {
    document.documentElement.setAttribute('lang', locale);
  }, [locale]);

  function t(key: string, vars?: Record<string, string | number>) {
    let str = DICTS[locale][key] ?? DICTS.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, String(v));
    return str;
  }

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
