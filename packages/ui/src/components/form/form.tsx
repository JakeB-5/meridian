import {
  type ReactNode,
  type FormHTMLAttributes,
  type ComponentProps,
} from 'react';
import {
  useForm,
  FormProvider,
  useFormContext,
  Controller,
  type UseFormReturn,
  type UseFormProps,
  type FieldValues,
  type FieldPath,
  type ControllerRenderProps,
  type ControllerFieldState,
  type UseFormStateReturn,
  type SubmitHandler,
  type SubmitErrorHandler,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodType, ZodTypeDef } from 'zod';
import { FormField } from './form-field.js';

// ---- Types ----

export interface FormProps<T extends FieldValues>
  extends Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'onError'> {
  /** Zod schema for validation */
  schema: ZodType<T, ZodTypeDef, unknown>;
  /** Default values for the form */
  defaultValues?: UseFormProps<T>['defaultValues'];
  /** Submit handler called with validated data */
  onSubmit: SubmitHandler<T>;
  /** Error handler called on validation failure */
  onError?: SubmitErrorHandler<T>;
  /** React-hook-form options (merged with schema resolver) */
  formOptions?: Omit<UseFormProps<T>, 'resolver' | 'defaultValues'>;
  /** Render children with form methods */
  children: ReactNode | ((methods: UseFormReturn<T>) => ReactNode);
}

/**
 * Form wrapper that integrates react-hook-form with Zod schema validation.
 * Provides FormProvider context for child FormControlField components.
 */
export function Form<T extends FieldValues>({
  schema,
  defaultValues,
  onSubmit,
  onError,
  formOptions,
  children,
  className,
  ...htmlProps
}: FormProps<T>) {
  const methods = useForm<T>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onBlur',
    ...formOptions,
  });

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(onSubmit, onError)}
        className={className}
        noValidate
        {...htmlProps}
      >
        {typeof children === 'function' ? children(methods) : children}
      </form>
    </FormProvider>
  );
}
Form.displayName = 'Form';

// ---- Controlled Field ----

export interface FormControlFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  /** Field name (path) */
  name: TName;
  /** Label text */
  label?: string;
  /** Description text */
  description?: string;
  /** Required indicator */
  required?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Render the controlled input */
  render: (props: {
    field: ControllerRenderProps<TFieldValues, TName>;
    fieldState: ControllerFieldState;
    formState: UseFormStateReturn<TFieldValues>;
  }) => ReactNode;
}

/**
 * Controlled form field that connects react-hook-form's Controller with FormField.
 * Automatically displays validation errors from the form context.
 */
export function FormControlField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  name,
  label,
  description,
  required,
  disabled,
  render,
}: FormControlFieldProps<TFieldValues, TName>) {
  const { control } = useFormContext<TFieldValues>();

  return (
    <Controller<TFieldValues, TName>
      name={name}
      control={control}
      disabled={disabled}
      render={({ field, fieldState, formState }) => (
        <FormField
          label={label}
          description={description}
          error={fieldState.error?.message}
          required={required}
          disabled={disabled}
        >
          {render({ field, fieldState, formState })}
        </FormField>
      )}
    />
  );
}
FormControlField.displayName = 'FormControlField';

// ---- Re-exports for convenience ----

export {
  useForm,
  useFormContext,
  Controller,
  FormProvider,
  type UseFormReturn,
  type UseFormProps,
  type FieldValues,
  type FieldPath,
  type SubmitHandler,
  type SubmitErrorHandler,
};
