import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField } from './form-field';
import { Input } from './input';

describe('FormField', () => {
  it('ties the label, description and error to the control', () => {
    render(
      <FormField
        label="Email"
        description="We'll never share it"
        error="Enter a valid email address"
        required
      >
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText(/email/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAccessibleDescription("We'll never share it Enter a valid email address");
    expect(screen.getByText('Enter a valid email address').closest('[aria-live]')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });

  it('keeps an existing id and has no error state by default', () => {
    render(
      <FormField label="Company">
        <Input id="company-input" />
      </FormField>,
    );
    const input = screen.getByLabelText('Company');
    expect(input).toHaveAttribute('id', 'company-input');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});

describe('FormField with a Controller-rendered control', () => {
  it('wires the label and error to a Select rendered through react-hook-form', async () => {
    const { useForm, Controller } = await import('react-hook-form');
    const { Select } = await import('./select');
    function Harness() {
      const { control } = useForm<{ stage: string }>({ defaultValues: { stage: 'a' } });
      return (
        <FormField label="Stage" error="Choose a stage">
          <Controller
            control={control}
            name="stage"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                options={[{ value: 'a', label: 'Lead in' }]}
              />
            )}
          />
        </FormField>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: 'Stage' });
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAccessibleDescription('Choose a stage');
  });
});
