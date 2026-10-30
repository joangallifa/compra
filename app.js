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
            codi: localStorage.getItem('cfg_codi') || '',
            url: window.APP_CONFIG.supabaseUrl.replace(/\/+$/, '')
        };
    }

    // L'àudio s'envia a la Edge Function de Supabase, que té la clau de Groq com a secret.
    async function processa(blob, tipus) {
        var cfg = llegeixConfig();
        var form = new FormData();
        form.append('audio', blob, 'audio.' + extensio(blob.type));
        form.append('tipus', tipus);

        var resp = await fetch(cfg.url + '/functions/v1/processa-audio', {
            method: 'POST',
            headers: { 'x-access-code': cfg.codi },
            body: form
        });
        var dades;
        try {
            dades = await resp.json();
        } catch (e) {
            throw new Error('Resposta no vàlida del servidor (HTTP ' + resp.status + ')');
        }
        if (resp.status === 401) throw new Error('Codi d'accés incorrecte.');
        if (!dades.success) throw new Error(dades.message || 'Error desconegut');
        return dades;
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
    var campCodi = document.getElementById('cfg-codi');
    campCodi.value = llegeixConfig().codi;

    function demanaClau() {
        panell.open = true;
        campCodi.focus();
        missatge('Primer escriu el codi d'accés i toca Desar.', 'error');
    }

    document.getElementById('obre-config').addEventListener('click', function () {
        panell.open = !panell.open;
    });
    document.getElementById('cfg-desa').addEventListener('click', function () {
        localStorage.setItem('cfg_codi', campCodi.value.trim());
        panell.open = false;
        missatge('Codi desat. Ja pots gravar.', 'ok');
    });
    if (!llegeixConfig().codi) demanaClau();

    botons.forEach(function (boto) {
        boto.addEventListener('click', function () {
            if (!llegeixConfig().codi) {
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
