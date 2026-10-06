try {
  const preference = localStorage.getItem('expedice-theme');
  const dark = preference === 'dark' || (!preference && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
} catch {
  document.documentElement.dataset.theme = 'light';
}
