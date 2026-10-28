// Mapa animado do roteiro: rota de cada dia, pinos nas paradas e um carrinho percorrendo o trajeto.
(function () {
    var canvas = document.getElementById('mapa-canvas');
    if (!canvas) return;
    var info = document.getElementById('mapa-info');
    var playBtn = document.getElementById('mapa-play');
    var dayBtns = document.querySelectorAll('.map-days button');

    if (!window.L || !window.ROTEIRO_MAPA) {
        canvas.innerHTML = '<p class="map-offline">O mapa precisa de internet para carregar.</p>';
        playBtn.hidden = true;
        return;
    }

    var P = window.ROTEIRO_MAPA.pontos;
    var DIAS = window.ROTEIRO_MAPA.dias;
    var reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var map = L.map(canvas, { scrollWheelZoom: false, zoomSnap: 0.25 });
    var camadas = {
        'Mapa': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd', maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }),
        'Relevo': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 18, attribution: 'Tiles &copy; Esri'
        }),
        'Satélite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 18, attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics'
        })
    };
    camadas['Relevo'].addTo(map);
    L.control.layers(camadas, null, { position: 'topright' }).addTo(map);
    // O zoom pela rodinha só liga depois de um clique, para não prender a rolagem da página.
    map.on('click', function () { map.scrollWheelZoom.enable(); });

    var ESTILO = {
        ida: { color: '#e63946', weight: 6, opacity: 0.95, lineCap: 'round', lineJoin: 'round' },
        volta: { color: '#e63946', weight: 4, opacity: 0.8, dashArray: '1 10', lineCap: 'round' },
        barco: { color: '#1f6fd1', weight: 4, opacity: 0.9, dashArray: '10 8' }
    };
    var FUNDO = { color: '#ffffff', weight: 7, opacity: 0.55 };

    var fundo = L.layerGroup().addTo(map);
    var rastro = L.layerGroup().addTo(map);
    var pinos = L.layerGroup().addTo(map);

    var SVG = {
        carro: '<svg viewBox="0 0 48 52" aria-hidden="true"><ellipse cx="24" cy="49" rx="16" ry="3" fill="rgba(0,0,0,.25)"/>' +
            '<rect x="7" y="4" width="34" height="38" rx="10" fill="#ffd21f" stroke="#17305e" stroke-width="2.5"/>' +
            '<rect x="12" y="9" width="24" height="14" rx="4" fill="#5ab0ea" stroke="#17305e" stroke-width="2"/>' +
            '<path d="M14 12l6 0-5 8" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/>' +
            '<rect x="10" y="29" width="7" height="5" rx="2.5" fill="#fff" stroke="#17305e" stroke-width="1.5"/>' +
            '<rect x="31" y="29" width="7" height="5" rx="2.5" fill="#fff" stroke="#17305e" stroke-width="1.5"/>' +
            '<rect x="19" y="30" width="10" height="3" rx="1.5" fill="#17305e"/>' +
            '<rect x="9" y="41" width="8" height="6" rx="2" fill="#17305e"/><rect x="31" y="41" width="8" height="6" rx="2" fill="#17305e"/></svg>',
        barco: '<svg viewBox="0 0 48 52" aria-hidden="true"><ellipse cx="24" cy="49" rx="18" ry="3" fill="rgba(0,0,0,.2)"/>' +
            '<rect x="15" y="14" width="18" height="14" rx="3" fill="#ffd21f" stroke="#17305e" stroke-width="2.5"/>' +
            '<rect x="18" y="17" width="12" height="5" rx="1.5" fill="#5ab0ea"/>' +
            '<path d="M4 28h40l-7 14H11z" fill="#fff" stroke="#17305e" stroke-width="2.5" stroke-linejoin="round"/>' +
            '<path d="M2 46c4 0 4-3 8-3s4 3 8 3 4-3 8-3 4 3 8 3 4-3 8-3 4 3 4 3" stroke="#1f6fd1" stroke-width="2.5" fill="none"/></svg>'
    };
    var iconeVeiculo = {
        carro: L.divIcon({ className: 'map-vehicle', html: SVG.carro, iconSize: [46, 50], iconAnchor: [23, 46] }),
        barco: L.divIcon({ className: 'map-vehicle', html: SVG.barco, iconSize: [46, 50], iconAnchor: [23, 46] })
    };
    var veiculo = L.marker([P.willemstad.lat, P.willemstad.lng], { icon: iconeVeiculo.carro, zIndexOffset: 1000, interactive: false, keyboard: false });
    var veiculoTipo = 'carro';

    var SIMBOLO = { base: '🏠', aeroporto: '✈', pier: '⚓' };

    function pino(id, rotulo) {
        var p = P[id];
        var m = L.marker([p.lat, p.lng], {
            icon: L.divIcon({
                className: 'map-pin map-pin--' + p.tipo,
                html: '<span><i>' + (rotulo || SIMBOLO[p.tipo] || '') + '</i></span>',
                iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -30], tooltipAnchor: [0, -30]
            }),
            title: p.nome, riseOnHover: true
        });
        m.bindTooltip(p.nome, { direction: 'top', className: 'map-tip' });
        if (p.link) m.bindPopup('<strong>' + p.nome + '</strong><br><a href="' + p.link + '">Ver detalhes no roteiro</a>');
        return m.addTo(pinos);
    }

    function km(a, b) {
        var r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
        var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 12742 * Math.asin(Math.sqrt(x));
    }

    // Distância "de animação" acumulada em cada vértice; o barco anda mais rápido na tela.
    var PREP = {};
    DIAS.forEach(function (dia) {
        var total = 0, trechos = [], paradas = [], bounds = L.latLngBounds([]);
        dia.trechos.forEach(function (t) {
            var peso = t.tipo === 'barco' ? 0.45 : 1;
            var cum = [total];
            for (var i = 1; i < t.linha.length; i++) {
                total += km(t.linha[i - 1], t.linha[i]) * peso;
                cum.push(total);
            }
            t.linha.forEach(function (c) { bounds.extend(c); });
            var desde = 0;
            t.nomes.slice(1).forEach(function (id) {
                var alvo = [P[id].lat, P[id].lng], melhor = desde, dmin = Infinity;
                for (var j = desde; j < t.linha.length; j++) {
                    var d = km(t.linha[j], alvo);
                    if (d < dmin) { dmin = d; melhor = j; }
                }
                desde = melhor;
                if (P[id].tipo !== 'base') paradas.push({ id: id, d: cum[melhor] });
            });
            trechos.push({ tipo: t.tipo, linha: t.linha, cum: cum });
        });
        PREP[dia.dia] = { total: total, trechos: trechos, paradas: paradas, bounds: bounds };
    });

    var marcadores = {};
    var atual = 0;
    var anim = null;
    var viagem = null;

    function desenharFundo(lista) {
        fundo.clearLayers();
        lista.forEach(function (dia) {
            dia.trechos.forEach(function (t) {
                L.polyline(t.linha, FUNDO).addTo(fundo);
                L.polyline(t.linha, L.extend({}, ESTILO[t.tipo], { opacity: 0.35 })).addTo(fundo);
            });
        });
    }

    function desenharPinos(dia) {
        pinos.clearLayers();
        marcadores = {};
        if (dia) {
            var n = 0, vistos = {};
            marcadores.willemstad = pino('willemstad');
            dia.trechos.forEach(function (t) {
                t.nomes.forEach(function (id) {
                    if (vistos[id] || id === 'willemstad') return;
                    vistos[id] = true;
                    var tipo = P[id].tipo;
                    marcadores[id] = pino(id, tipo === 'praia' || tipo === 'ilha' ? String(++n) : null);
                });
            });
        } else {
            // Visão geral: o número do pino é o dia da visita.
            var diaDe = {};
            DIAS.forEach(function (d) {
                d.trechos.forEach(function (t) {
                    t.nomes.forEach(function (id) { if (!(id in diaDe)) diaDe[id] = d.dia; });
                });
            });
            Object.keys(P).forEach(function (id) {
                var tipo = P[id].tipo;
                marcadores[id] = pino(id, tipo === 'praia' || tipo === 'ilha' ? String(diaDe[id]) : null);
            });
        }
    }

    function fmtMin(m) {
        if (m < 60) return m + ' min';
        var h = Math.floor(m / 60), r = m % 60;
        return h + 'h' + (r ? (r < 10 ? '0' : '') + r : '');
    }

    function resumo(dia) {
        var carroMin = 0, carroKm = 0, passos = [], n = 0, numeros = {};
        dia.trechos.forEach(function (t, i) {
            if (i === 0) passos.push('<span class="mi-stop">' + rotuloPasso(t.nomes[0]) + '</span>');
            t.nomes.slice(1).forEach(function (id, k) {
                var min = t.min[k] || 0;
                passos.push('<span class="mi-leg mi-leg--' + t.tipo + '">' + (t.tipo === 'barco' ? '🚤 ' : '') + fmtMin(min) + '</span>');
                passos.push('<span class="mi-stop">' + rotuloPasso(id) + '</span>');
            });
            if (t.tipo !== 'barco') {
                carroKm += t.km;
                t.min.forEach(function (m) { carroMin += m; });
            }
        });
        function rotuloPasso(id) {
            var p = P[id];
            if (p.tipo === 'praia' || p.tipo === 'ilha') {
                if (!numeros[id]) numeros[id] = ++n;
                return '<b class="mi-num">' + numeros[id] + '</b>' + p.nome;
            }
            return (SIMBOLO[p.tipo] || '') + ' ' + (p.tipo === 'base' ? 'Willemstad' : p.nome);
        }
        return '<p class="mi-title"><b>Dia ' + dia.dia + ' · ' + dia.data + '</b> ' + dia.titulo + '</p>' +
            '<div class="mi-steps">' + passos.join('') + '</div>' +
            '<p class="mi-total">' + Math.round(carroKm) + ' km de carro · ' + fmtMin(carroMin) + ' dirigindo</p>';
    }

    function resumoGeral() {
        var kmTotal = 0, minTotal = 0;
        DIAS.forEach(function (d) {
            d.trechos.forEach(function (t) {
                if (t.tipo === 'barco') return;
                kmTotal += t.km;
                t.min.forEach(function (m) { minTotal += m; });
            });
        });
        return '<p class="mi-title"><b>Visão geral</b> 8 dias · o número de cada pino é o dia da visita</p>' +
            '<p class="mi-total">' + Math.round(kmTotal) + ' km de carro na viagem toda · cerca de ' + fmtMin(minTotal) + ' dirigindo. Escolha um dia para ver o trajeto.</p>';
    }

    function parar() {
        viagem = null;
        if (anim) cancelAnimationFrame(anim.raf);
        anim = null;
        playBtn.classList.remove('is-playing');
        atualizarBotao();
    }

    function atualizarBotao() {
        if (anim || viagem) playBtn.textContent = '■ Parar';
        else playBtn.textContent = atual ? '▶ Animar o dia ' + atual : '▶ Ver a viagem animada';
    }

    function trocarVeiculo(tipo) {
        var v = tipo === 'barco' ? 'barco' : 'carro';
        if (v !== veiculoTipo) {
            veiculoTipo = v;
            veiculo.setIcon(iconeVeiculo[v]);
        }
    }

    function desenhar(prep, linhas, d) {
        var pos = null, tipo = 'ida';
        prep.trechos.forEach(function (t, i) {
            var fim = t.cum[t.cum.length - 1];
            if (d >= fim) {
                if (linhas[i].getLatLngs().length !== t.linha.length) linhas[i].setLatLngs(t.linha);
                if (!pos || d === fim) { pos = t.linha[t.linha.length - 1]; tipo = t.tipo; }
            } else if (d > t.cum[0]) {
                var j = 0;
                while (j < t.cum.length - 2 && t.cum[j + 1] <= d) j++;
                var seg = t.cum[j + 1] - t.cum[j] || 1, f = (d - t.cum[j]) / seg;
                var a = t.linha[j], b = t.linha[j + 1];
                pos = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
                linhas[i].setLatLngs(t.linha.slice(0, j + 1).concat([pos]));
                tipo = t.tipo;
            } else {
                linhas[i].setLatLngs([]);
            }
        });
        if (pos) {
            veiculo.setLatLng(pos);
            trocarVeiculo(tipo);
        }
    }

    function piscar(id) {
        var m = marcadores[id];
        if (!m) return;
        m.openTooltip();
        var el = m.getElement();
        if (el) {
            el.classList.remove('is-hit');
            void el.offsetWidth;
            el.classList.add('is-hit');
        }
        setTimeout(function () { m.closeTooltip(); }, 1400);
    }

    function animarDia(n, aoTerminar, manterRastro) {
        var prep = PREP[n];
        if (!manterRastro) rastro.clearLayers();
        var linhas = prep.trechos.map(function (t) { return L.polyline([], ESTILO[t.tipo]).addTo(rastro); });
        veiculo.addTo(map);
        if (reduzir) {
            desenhar(prep, linhas, prep.total);
            if (aoTerminar) aoTerminar();
            return;
        }
        var dur = Math.max(5000, Math.min(15000, 3500 + prep.total * 95));
        var t0 = null, pausa = 0, espera = 0, prox = 0;
        anim = { raf: 0 };
        playBtn.classList.add('is-playing');
        atualizarBotao();
        function quadro(ts) {
            if (!anim) return;
            if (t0 === null) t0 = ts;
            if (ts < espera) { anim.raf = requestAnimationFrame(quadro); return; }
            var d = Math.min(prep.total, (ts - t0 - pausa) / dur * prep.total);
            var par = prep.paradas[prox];
            if (par && d >= par.d) {
                d = par.d;
                prox++;
                espera = ts + 800;
                pausa += 800;
                piscar(par.id);
            }
            desenhar(prep, linhas, d);
            if (d >= prep.total && prox >= prep.paradas.length) {
                anim = null;
                playBtn.classList.remove('is-playing');
                atualizarBotao();
                if (aoTerminar) aoTerminar();
                return;
            }
            anim.raf = requestAnimationFrame(quadro);
        }
        anim.raf = requestAnimationFrame(quadro);
    }

    function enquadrar(bounds, depois) {
        if (reduzir) {
            map.fitBounds(bounds, { padding: [40, 40] });
            if (depois) depois();
            return;
        }
        var feito = false;
        function seguir() {
            if (feito) return;
            feito = true;
            if (depois) depois();
        }
        map.once('moveend', seguir);
        map.flyToBounds(bounds, { padding: [40, 40], duration: 0.9 });
        setTimeout(seguir, 1300);
    }

    function boundsGerais() {
        var b = L.latLngBounds([]);
        DIAS.forEach(function (d) { b.extend(PREP[d.dia].bounds); });
        return b;
    }

    function selecionar(n, instantaneo) {
        parar();
        atual = n;
        dayBtns.forEach(function (b) {
            var ativo = Number(b.dataset.mapaDia) === n;
            b.setAttribute('aria-pressed', String(ativo));
            if (ativo) b.parentElement.scrollTo({ left: b.offsetLeft - (b.parentElement.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
        });
        rastro.clearLayers();
        if (n) {
            var dia = DIAS[n - 1];
            desenharFundo([dia]);
            desenharPinos(dia);
            info.innerHTML = resumo(dia);
            var ini = dia.trechos[0].linha[0];
            veiculo.setLatLng(ini).addTo(map);
            trocarVeiculo(dia.trechos[0].tipo);
            if (instantaneo) map.fitBounds(PREP[n].bounds, { padding: [40, 40] });
        } else {
            desenharFundo(DIAS);
            desenharPinos(null);
            info.innerHTML = resumoGeral();
            veiculo.remove();
            if (instantaneo) map.fitBounds(boundsGerais(), { padding: [30, 30] });
        }
        atualizarBotao();
    }

    function tocarDia(n) {
        selecionar(n);
        enquadrar(PREP[n].bounds, function () { animarDia(n); });
    }

    function tocarViagem() {
        selecionar(0);
        var sessao = viagem = {};
        var i = 1;
        function proximo() {
            if (viagem !== sessao) return;
            if (i > DIAS.length) {
                viagem = null;
                atualizarBotao();
                info.innerHTML = resumoGeral();
                enquadrar(boundsGerais());
                return;
            }
            var n = i++;
            info.innerHTML = resumo(DIAS[n - 1]);
            atualizarBotao();
            enquadrar(PREP[n].bounds, function () {
                if (viagem !== sessao) return;
                animarDia(n, function () { setTimeout(proximo, 500); }, true);
            });
        }
        proximo();
    }

    playBtn.addEventListener('click', function () {
        if (anim || viagem) { parar(); return; }
        if (atual) tocarDia(atual);
        else tocarViagem();
    });

    dayBtns.forEach(function (b) {
        b.addEventListener('click', function () {
            var n = Number(b.dataset.mapaDia);
            if (n) tocarDia(n);
            else {
                selecionar(0);
                enquadrar(boundsGerais());
            }
        });
    });

    // Botões "Ver trajeto no mapa" dentro de cada dia do roteiro.
    document.querySelectorAll('.day-map-btn').forEach(function (b) {
        b.addEventListener('click', function () {
            var n = Number(b.dataset.mapaDia);
            document.getElementById('mapa').scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
            setTimeout(function () { tocarDia(n); }, reduzir ? 0 : 650);
        });
    });

    selecionar(0, true);
})();
