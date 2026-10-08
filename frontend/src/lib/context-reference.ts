import { copyText, request } from './api';

export async function copyContextReference(id: string, ref = '') {
  const result = await request<{ text: string }>('/api/context-reference', {
    id,
    ref,
  });
  await copyText(result.text);
}
