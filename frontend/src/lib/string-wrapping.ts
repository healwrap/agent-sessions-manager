let wrapped = false;
export const stringWrapping = {
  label: '自动换行',
  getDefault: () => wrapped,
  setDefault: (value: boolean) => {
    wrapped = value;
  },
};
