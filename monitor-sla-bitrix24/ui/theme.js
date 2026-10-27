// Aplica o tema antes de a página aparecer (evita piscar claro/escuro). Script clássico, sem módulos.
try {
  var t = localStorage.getItem('tema');
  if (t === 'claro') document.documentElement.dataset.theme = 'light';
  else if (t === 'escuro') document.documentElement.dataset.theme = 'dark';
} catch (e) { /* sem acesso ao armazenamento: segue o sistema */ }
