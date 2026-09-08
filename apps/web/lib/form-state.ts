export interface FormState {
  message: string;
  status: 'idle' | 'error' | 'success';
}

export const initialFormState: FormState = { message: '', status: 'idle' };
