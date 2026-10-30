(function () {
    'use strict';

    var MAX_SEGONS = 30;

    var botons = document.querySelectorAll('.boto');
    var estat = document.getElementById('estat');
    var resultat = document.getElementById('resultat');

    var recorder = null;
    var stream = null;
    var trossos = [];
    var temporitzador = null;
    var botoActiu = null;
    var tipusActiu = null;

    function missatge(text, classe) {
        estat.textContent = text;
        estat.className = 'estat' + (classe ? ' ' + classe : '');
    }

    function triaMime() {
        var candidats = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
        for (var i = 0; i < candidats.length; i++) {
            if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidats[i])) {
                return candidats[i];
            }
        }
        return '';
    }

    function extensio(mime) {
        if (mime.indexOf('mp4') !== -1) return 'm4a';
        if (mime.indexOf('ogg') !== -1) return 'ogg';
        return 'webm';
    }

    function bloqueja(bloquejat) {
        botons.forEach(function (b) { b.disabled = bloquejat && b !== botoActiu; });
    }

    async function inicia(boto) {
        if (!navigator.mediaDevices || !window.MediaRecorder) {
            missatge('Aquest navegador no permet gravar àudio (cal HTTPS).', 'error');
            return;
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            missatge('No s\'ha pogut accedir al micròfon: ' + e.message, 'error');
            return;
        }

        var mime = triaMime();
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        trossos = [];
        botoActiu = boto;
        tipusActiu = boto.getAttribute('data-tipus');

        recorder.ondataavailable = function (ev) { if (ev.data.size) trossos.push(ev.data); };
        recorder.onstop = function () {
            var tipusMime = recorder.mimeType || mime || 'audio/webm';
            stream.getTracks().forEach(function (t) { t.stop(); });
            envia(new Blob(trossos, { type: tipusMime }), tipusActiu);
        };

        recorder.start();
        boto.classList.add('gravant');
        bloqueja(true);

        var restants = MAX_SEGONS;
        missatge('🎙 T\'escolto... ' + restants + ' s. Torna a tocar el botó per acabar.');
        temporitzador = setInterval(function () {
            restants--;
            missatge('🎙 T\'escolto... ' + restants + ' s. Torna a tocar el botó per acabar.');
            if (restants <= 0) atura();
        }, 1000);
    }

    function atura() {
        clearInterval(temporitzador);
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        if (botoActiu) botoActiu.classList.remove('gravant');
    }

    function llegeixConfig() {
        return {
            groq: sessionStorage.getItem('cfg_groq') || '',
            url: window.APP_CONFIG.supabaseUrl.replace(/\/+$/, ''),
            anon: window.APP_CONFIG.supabaseKey
        };
    }

    async function crida(url, opcions) {
        var resp = await fetch(url, opcions);
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (await resp.text()));
        return resp;
    }

    // Models de text preferits (ordre de preferencia); s'usa el primer disponible per a la clau.
    var MODELS_LLM = [
        'llama-3.3-70b-versatile',
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'llama-3.1-8b-instant'
    ];

    async function triaModel(clauGroq) {
        var dades = await (await crida('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: 'Bearer ' + clauGroq }
        })).json();
        var disponibles = (dades.data || []).map(function (m) { return m.id; });
        for (var i = 0; i < MODELS_LLM.length; i++) {
            if (disponibles.indexOf(MODELS_LLM[i]) !== -1) return MODELS_LLM[i];
        }
        throw new Error('Cap model de text disponible. Models: ' + disponibles.join(', '));
    }

    async function processa(blob, tipus) {
        var cfg = llegeixConfig();

        // 1) Transcripcio
        var form = new FormData();
        form.append('file', blob, 'audio.' + extensio(blob.type));
        form.append('model', 'whisper-large-v3-turbo');
        form.append('language', 'ca');
        form.append('prompt', 'Llista de la compra en català: llet, pa, ous, pomes, formatge, llaunes de tomàquet.');
        form.append('response_format', 'json');
        var stt = await (await crida('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + cfg.groq },
            body: form
        })).json();
        var transcripcio = (stt.text || '').trim();
        if (!transcripcio) return { transcripcio: '', productes: [] };

        // 2) Extraccio de productes
        var model = await triaModel(cfg.groq);
        var llm = await (await crida('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + cfg.groq, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: 'Extreus productes d\'una transcripció parlada en català. ' +
                            'Respon NOMÉS amb JSON: {"productes":["producte 1","producte 2"]}. ' +
                            'Escriu sempre els noms dels productes en català (tradueix-los si cal). ' +
                            'Cada producte en minúscules; inclou la quantitat si es diu (ex: "2 litres de llet"). ' +
                            'Ignora paraules que no siguin productes. Si no n\'hi ha cap, retorna {"productes":[]}.'
                    },
                    { role: 'user', content: transcripcio }
                ]
            })
        })).json();
        var contingut = JSON.parse(llm.choices[0].message.content || '{}');
        var productes = (contingut.productes || [])
            .map(function (p) { return String(p).trim(); })
            .filter(Boolean);

        // 3) Desar a Supabase (la data la posa la BD amb default now())
        if (productes.length) {
            await crida(cfg.url + '/rest/v1/productes', {
                method: 'POST',
                headers: {
                    apikey: cfg.anon,
                    Authorization: 'Bearer ' + cfg.anon,
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal'
                },
                body: JSON.stringify(productes.map(function (nom) {
                    return { nom: nom, tipus: tipus, fet: false };
                }))
            });
        }
        return { transcripcio: transcripcio, productes: productes };
    }

    async function envia(blob, tipus) {
        botons.forEach(function (b) { b.disabled = true; });
        missatge('⏳ Un moment, ho estic processant...');
        resultat.innerHTML = '';

        try {
            var dades = await processa(blob, tipus);

            if (dades.productes.length === 0) {
                missatge(dades.transcripcio
                    ? 'No he trobat cap producte a: "' + dades.transcripcio + '". Torna-ho a provar.'
                    : 'No he sentit res. Torna-ho a provar.', 'error');
            } else {
                if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
                missatge('✔ Afegit' + (dades.productes.length > 1 ? 's' : '') + ' ' + dades.productes.length +
                    ' producte' + (dades.productes.length > 1 ? 's' : '') + ' a ' +
                    (tipus === 'traster' ? 'Pujar del traster' : 'la Compra'), 'ok');
                dades.productes.forEach(function (nom) {
                    var li = document.createElement('li');
                    li.textContent = nom;
                    resultat.appendChild(li);
                });
            }
        } catch (e) {
            missatge('Error: ' + e.message, 'error');
        } finally {
            botoActiu = null;
            botons.forEach(function (b) { b.disabled = false; });
        }
    }

    var panell = document.getElementById('config');
    var campGroq = document.getElementById('cfg-groq');
    campGroq.value = llegeixConfig().groq;

    function demanaClau() {
        missatge("Falta la clau de Groq. Toca la rodeta ⚙ per posar-la.", 'error');
    }

    document.getElementById('obre-config').addEventListener('click', function () {
        panell.open = !panell.open;
        if (panell.open) campGroq.focus();
    });
    document.getElementById('cfg-desa').addEventListener('click', function () {
        sessionStorage.setItem('cfg_groq', campGroq.value.trim());
        panell.open = false;
        missatge('Clau desada. Ja pots gravar.', 'ok');
    });
    botons.forEach(function (boto) {
        boto.addEventListener('click', function () {
            if (!llegeixConfig().groq) {
                demanaClau();
                return;
            }
            if (navigator.vibrate) navigator.vibrate(40);
            if (recorder && recorder.state === 'recording') {
                atura();
            } else {
                inicia(boto);
            }
        });
    });
})();
