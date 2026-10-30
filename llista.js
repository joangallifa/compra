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

    function boto(text, etiqueta, classe) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.className = 'icona-fila ' + (classe || '');
        b.setAttribute('aria-label', etiqueta);
        return b;
    }

    function creaFila(f) {
        var li = document.createElement('li');
        mostraFila(li, f, false);
        return li;
    }

    function mostraFila(li, f, marcat) {
        li.innerHTML = '';
        li.className = 'fila';

        var label = document.createElement('label');
        var check = document.createElement('input');
        check.type = 'checkbox';
        check.value = f.id;
        check.checked = marcat;
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

        var edita = boto('✏️', 'Edita ' + f.nom);
        edita.addEventListener('click', function () { editaFila(li, f, check.checked); });
        var esborra = boto('🗑️', 'Esborra ' + f.nom, 'perill');
        esborra.addEventListener('click', function () { esborraFila(li, f); });

        li.appendChild(label);
        li.appendChild(edita);
        li.appendChild(esborra);
        actualitzaBotons();
    }

    function editaFila(li, f, marcat) {
        li.innerHTML = '';
        li.className = 'fila editant';
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'edita-nom';
        input.value = f.nom;
        input.maxLength = 120;
        var desa = boto('✔', 'Desa els canvis', 'ok');
        var cancela = boto('✖', 'Cancel·la');

        async function guarda() {
            var nouNom = input.value.trim();
            if (!nouNom) { input.focus(); return; }
            if (nouNom === f.nom) { mostraFila(li, f, marcat); return; }
            desa.disabled = true;
            try {
                await supabase('productes?id=eq.' + encodeURIComponent(f.id), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                    body: JSON.stringify({ nom: nouNom })
                });
                f.nom = nouNom;
                mostraFila(li, f, marcat);
            } catch (e) {
                desa.disabled = false;
                missatge('Error en desar: ' + e.message, 'error');
            }
        }

        desa.addEventListener('click', guarda);
        cancela.addEventListener('click', function () { mostraFila(li, f, marcat); });
        input.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') guarda();
            if (ev.key === 'Escape') mostraFila(li, f, marcat);
        });

        li.appendChild(input);
        li.appendChild(desa);
        li.appendChild(cancela);
        actualitzaBotons();
        input.focus();
        input.select();
    }

    async function esborraFila(li, f) {
        if (!window.confirm('Esborrar "' + f.nom + '"?')) return;
        try {
            await supabase('productes?id=eq.' + encodeURIComponent(f.id), {
                method: 'DELETE',
                headers: { Prefer: 'return=minimal' }
            });
            li.remove();
            actualitzaBotons();
            if (!llista.children.length) missatge('No hi ha res pendent.', 'ok');
        } catch (e) {
            missatge('Error en esborrar: ' + e.message, 'error');
        }
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
            files.forEach(function (f) { llista.appendChild(creaFila(f)); });
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
