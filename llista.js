(function () {
    'use strict';

    var estat = document.getElementById('estat');
    var llista = document.getElementById('productes');
    var btnTot = document.getElementById('sel-tot');
    var btnFet = document.getElementById('desa-fet');
    var pestanyes = document.querySelectorAll('.pestanya');
    var tipus = 'compra';

    function missatge(text, classe) {
        estat.textContent = text;
        estat.className = 'estat' + (classe ? ' ' + classe : '');
        estat.hidden = !text;
    }

    function config() {
        return {
            url: window.APP_CONFIG.supabaseUrl.replace(/\/+$/, ''),
            anon: window.APP_CONFIG.supabaseKey
        };
    }

    async function supabase(cami, opcions) {
        var cfg = config();
        if (!cfg.url || !cfg.anon) {
            throw new Error('Falta configurar Supabase (a la pàgina principal, ⚙ Configuració).');
        }
        opcions = opcions || {};
        opcions.headers = Object.assign({
            apikey: cfg.anon,
            Authorization: 'Bearer ' + cfg.anon
        }, opcions.headers || {});
        var resp = await fetch(cfg.url + '/rest/v1/' + cami, opcions);
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (await resp.text()));
        return resp;
    }

    function formatData(iso) {
        var d = new Date(iso);
        return d.toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit' });
    }

    function marcats() {
        return Array.prototype.slice.call(llista.querySelectorAll('input:checked'));
    }

    function actualitzaBotons() {
        var caselles = llista.querySelectorAll('input');
        var n = marcats().length;
        btnFet.disabled = n === 0;
        btnFet.textContent = n ? 'Desar com a fet (' + n + ')' : 'Desar com a fet';
        btnTot.textContent = caselles.length && n === caselles.length ? 'Desmarcar tot' : 'Seleccionar tot';
        btnTot.disabled = caselles.length === 0;
    }

    async function carrega() {
        llista.innerHTML = '';
        missatge('Carregant...');
        actualitzaBotons();
        try {
            var resp = await supabase('productes?select=id,nom,data&fet=eq.false&tipus=eq.' +
                encodeURIComponent(tipus) + '&order=data.asc');
            var files = await resp.json();
            if (!files.length) {
                missatge('No hi ha res pendent.', 'ok');
                return;
            }
            missatge('');
            files.forEach(function (f) {
                var li = document.createElement('li');
                var label = document.createElement('label');
                var check = document.createElement('input');
                check.type = 'checkbox';
                check.value = f.id;
                check.addEventListener('change', actualitzaBotons);
                var nom = document.createElement('span');
                nom.className = 'nom';
                nom.textContent = f.nom;
                var data = document.createElement('span');
                data.className = 'data';
                data.textContent = formatData(f.data);
                label.appendChild(check);
                label.appendChild(nom);
                label.appendChild(data);
                li.appendChild(label);
                llista.appendChild(li);
            });
            actualitzaBotons();
        } catch (e) {
            missatge('Error: ' + e.message, 'error');
        }
    }

    btnTot.addEventListener('click', function () {
        var caselles = llista.querySelectorAll('input');
        var tots = marcats().length === caselles.length;
        caselles.forEach(function (c) { c.checked = !tots; });
        actualitzaBotons();
    });

    btnFet.addEventListener('click', async function () {
        var ids = marcats().map(function (c) { return c.value; });
        if (!ids.length) return;
        btnFet.disabled = true;
        try {
            await supabase('productes?id=in.(' + ids.join(',') + ')', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                body: JSON.stringify({ fet: true })
            });
            await carrega();
            missatge('Desats ' + ids.length + ' com a fet.', 'ok');
        } catch (e) {
            missatge('Error: ' + e.message, 'error');
            actualitzaBotons();
        }
    });

    pestanyes.forEach(function (p) {
        p.addEventListener('click', function () {
            tipus = p.getAttribute('data-tipus');
            pestanyes.forEach(function (x) { x.classList.toggle('actual', x === p); });
            carrega();
        });
    });

    carrega();
})();
