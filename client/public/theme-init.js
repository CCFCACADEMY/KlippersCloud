try { if (localStorage.getItem('klippers-theme') === 'light') document.documentElement.classList.remove('dark'); } catch (e) { /* storage disabled */ }
