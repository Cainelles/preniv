(() => {
  'use strict';

  // Mostra a data de hoje no topo da página inicial
  const el = document.getElementById('hoje');
  if (el) {
    const texto = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
    el.textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
  }
})();
