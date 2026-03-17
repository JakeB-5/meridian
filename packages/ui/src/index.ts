// ---- Utilities ----
export { cn } from './utils/cn.js';

// ---- Components: Button ----
export {
  Button,
  ButtonLink,
  buttonVariants,
  type ButtonProps,
  type ButtonLinkProps,
  type ButtonVariantProps,
} from './components/button/button.js';

// ---- Components: Input ----
export {
  Input,
  inputVariants,
  type InputProps,
  type InputVariantProps,
} from './components/input/input.js';

// ---- Components: Select ----
export {
  Select,
  type SelectProps,
  type SingleSelectProps,
  type MultiSelectProps,
  type SelectOption,
  type SelectOptionGroup,
} from './components/select/select.js';

// ---- Components: Modal ----
export {
  Modal,
  type ModalProps,
} from './components/modal/modal.js';

// ---- Components: Dropdown ----
export {
  Dropdown,
  useDropdown,
  type DropdownProps,
  type DropdownItem,
  type DropdownDivider,
  type DropdownLabel,
  type DropdownMenuItem,
} from './components/dropdown/dropdown.js';

// ---- Components: Table ----
export {
  DataTable,
  TableRoot,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  type DataTableProps,
  type ColumnDef,
  type SortState,
  type SortDirection,
} from './components/table/table.js';

export {
  Pagination,
  type PaginationProps,
} from './components/table/pagination.js';

// ---- Components: Card ----
export {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  type CardProps,
  type CardHeaderProps,
  type CardBodyProps,
  type CardFooterProps,
} from './components/card/card.js';

// ---- Components: Badge ----
export {
  Badge,
  badgeVariants,
  type BadgeProps,
  type BadgeVariantProps,
} from './components/badge/badge.js';

// ---- Components: Avatar ----
export {
  Avatar,
  avatarVariants,
  type AvatarProps,
  type AvatarVariantProps,
} from './components/avatar/avatar.js';

// ---- Components: Toast ----
export {
  ToastItem,
  toastVariants,
  type ToastData,
  type ToastType,
  type ToastItemProps,
} from './components/toast/toast.js';

export {
  ToastProvider,
  useToast,
  type ToastProviderProps,
  type ToastOptions,
  type ToastContextValue,
} from './components/toast/toast-provider.js';

// ---- Components: Sidebar ----
export {
  Sidebar,
  useSidebar,
  type SidebarProps,
  type SidebarNavItem,
  type SidebarSection,
} from './components/sidebar/sidebar.js';

// ---- Components: Header ----
export {
  Header,
  HeaderNavLink,
  type HeaderProps,
  type HeaderNavLinkProps,
} from './components/header/header.js';

// ---- Components: Layout ----
export {
  Layout,
  PageContainer,
  PageHeader,
  type LayoutProps,
  type PageContainerProps,
  type PageHeaderProps,
} from './components/layout/layout.js';

// ---- Components: Form ----
export {
  FormField,
  type FormFieldProps,
} from './components/form/form-field.js';

export {
  Form,
  FormControlField,
  useForm,
  useFormContext,
  Controller,
  FormProvider,
  type FormProps,
  type FormControlFieldProps,
  type UseFormReturn,
  type UseFormProps,
  type FieldValues,
  type FieldPath,
  type SubmitHandler,
  type SubmitErrorHandler,
} from './components/form/form.js';

// ---- Components: Skeleton ----
export {
  Skeleton,
  SkeletonText,
  type SkeletonProps,
  type SkeletonTextProps,
} from './components/skeleton/skeleton.js';

// ---- Components: Spinner ----
export {
  Spinner,
  spinnerVariants,
  type SpinnerProps,
  type SpinnerVariantProps,
} from './components/spinner/spinner.js';

// ---- Components: Tabs ----
export {
  Tabs,
  type TabsProps,
  type TabItem,
} from './components/tabs/tabs.js';

// ---- Components: Code Editor ----
export {
  CodeEditor,
  type CodeEditorProps,
} from './components/code-editor/code-editor.js';

// ---- Hooks ----
export {
  useMediaQuery,
  useBreakpoint,
} from './hooks/use-media-query.js';

export { useClickOutside } from './hooks/use-click-outside.js';

export {
  useDebounce,
  useDebouncedCallback,
} from './hooks/use-debounce.js';

export { useLocalStorage } from './hooks/use-local-storage.js';
