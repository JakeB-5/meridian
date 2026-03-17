import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';
import { Form, FormControlField } from './form.js';
import { FormField } from './form-field.js';

describe('FormField', () => {
  it('renders label and children', () => {
    render(
      <FormField label="Name">
        <input type="text" />
      </FormField>,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows required indicator', () => {
    render(
      <FormField label="Email" required>
        <input type="email" />
      </FormField>,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('shows error message', () => {
    render(
      <FormField label="Name" error="Required">
        <input type="text" />
      </FormField>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });

  it('shows description text', () => {
    render(
      <FormField label="Name" description="Enter full name">
        <input type="text" />
      </FormField>,
    );
    expect(screen.getByText('Enter full name')).toBeInTheDocument();
  });

  it('hides description when error present', () => {
    render(
      <FormField label="Name" description="Help" error="Error">
        <input type="text" />
      </FormField>,
    );
    expect(screen.queryByText('Help')).not.toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('sets aria-invalid on child when error', () => {
    render(
      <FormField label="Name" error="Invalid">
        <input type="text" />
      </FormField>,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Form with Zod', () => {
  const schema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email'),
  });

  it('renders form and submits valid data', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <Form schema={schema} onSubmit={onSubmit} defaultValues={{ name: '', email: '' }}>
        {({ register }) => (
          <>
            <FormField label="Name">
              <input {...register('name')} />
            </FormField>
            <FormField label="Email">
              <input {...register('email')} />
            </FormField>
            <button type="submit">Submit</button>
          </>
        )}
      </Form>,
    );

    await user.type(screen.getByLabelText('Name'), 'John');
    await user.type(screen.getByLabelText('Email'), 'john@test.com');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { name: 'John', email: 'john@test.com' },
        expect.anything(),
      );
    });
  });

  it('shows validation errors on submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <Form schema={schema} onSubmit={onSubmit} defaultValues={{ name: '', email: '' }}>
        {({ register, formState: { errors } }) => (
          <>
            <FormField label="Name" error={errors.name?.message}>
              <input {...register('name')} />
            </FormField>
            <FormField label="Email" error={errors.email?.message}>
              <input {...register('email')} />
            </FormField>
            <button type="submit">Submit</button>
          </>
        )}
      </Form>,
    );

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByText('Name must be at least 2 characters')).toBeInTheDocument();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
