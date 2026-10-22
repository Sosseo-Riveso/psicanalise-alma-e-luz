/**
 * ============================================================================
 * SISTEMA DE TRIAGEM E GESTÃO DE CONTATOS (MINI CRM) — PSICANÁLISE ALMA E LUZ
 * Valéria Pereira • Terapia Individual, Casal e Terapias Complementares
 * ============================================================================
 * - Intercepta cliques nos botões de WhatsApp
 * - Abre um modal acolhedor em 1ª pessoa (Nome + WhatsApp)
 * - Registra o lead no localStorage (retenção de 1 ano) e sincroniza com /api/triagem
 * - Redireciona imediatamente para o WhatsApp oficial da Valéria: (11) 92675-5744
 * ============================================================================
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'psicanalise_almaeluz_triagem_v1';
    var RETENTION_DAYS = 365; // 1 ano de histórico

    // ─── UTILITÁRIOS DE ARMAZENAMENTO ───────────────────────────────────────
    function getRegistros() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function salvarRegistros(lista) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
        } catch (e) {}
    }

    function limparExpirados() {
        var lista = getRegistros();
        if (!lista.length) return;
        var limite = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
        var filtrada = lista.filter(function (item) {
            return item.ts && item.ts >= limite;
        });
        if (filtrada.length !== lista.length) {
            salvarRegistros(filtrada);
        }
    }

    var SESSION_ORIGEM_KEY = 'almaeluz_origem_sessao_v1';
    var LAST_UTM_KEY = 'almaeluz_last_utm_v1';

    function formatarOrigemDaUrlOuReferrer() {
        try {
            var params = new URLSearchParams(window.location.search);
            var utmSource = (params.get('utm_source') || '').trim();
            var utmMedium = (params.get('utm_medium') || '').trim();
            var utmCampaign = (params.get('utm_campaign') || '').trim();

            if (utmSource) {
                var srcLower = utmSource.toLowerCase();
                var origemStr = '';
                if (srcLower === 'gmn' || srcLower === 'gbp' || srcLower === 'google-meu-negocio') {
                    origemStr = 'Google Perfil Empresa (GMN)' +
                        (utmMedium ? ' • ' + utmMedium : '') +
                        (utmCampaign ? ' [' + utmCampaign + ']' : '');
                } else if (srcLower === 'youtube' || srcLower === 'yt') {
                    origemStr = 'YouTube' +
                        (utmMedium ? ' (' + utmMedium + ')' : '') +
                        (utmCampaign ? ' [' + utmCampaign + ']' : '');
                } else if (srcLower === 'instagram' || srcLower === 'ig') {
                    origemStr = 'Instagram' +
                        (utmMedium ? ' (' + utmMedium + ')' : '') +
                        (utmCampaign ? ' [' + utmCampaign + ']' : '');
                } else {
                    origemStr = utmSource +
                        (utmMedium ? ' / ' + utmMedium : '') +
                        (utmCampaign ? ' [' + utmCampaign + ']' : '');
                }
                try {
                    sessionStorage.setItem(SESSION_ORIGEM_KEY, origemStr);
                    localStorage.setItem(LAST_UTM_KEY, JSON.stringify({ origem: origemStr, ts: Date.now() }));
                } catch (e) {}
                return origemStr;
            }

            if (document.referrer) {
                var ref = document.referrer.toLowerCase();
                var refUrl = new URL(document.referrer);
                if (refUrl.hostname !== window.location.hostname) {
                    var refOrigem = '';
                    if (ref.indexOf('google.com/maps') !== -1 || ref.indexOf('g.page') !== -1) {
                        refOrigem = 'Google Maps / GMN';
                    } else if (ref.indexOf('youtube.com') !== -1 || ref.indexOf('youtu.be') !== -1) {
                        refOrigem = 'YouTube (Referência do Canal)';
                    } else if (ref.indexOf('instagram.com') !== -1) {
                        refOrigem = 'Instagram';
                    } else if (ref.indexOf('google.') !== -1) {
                        refOrigem = 'Busca Orgânica Google';
                    } else {
                        refOrigem = refUrl.hostname.replace(/^www\./, '');
                    }
                    try {
                        if (!sessionStorage.getItem(SESSION_ORIGEM_KEY)) {
                            sessionStorage.setItem(SESSION_ORIGEM_KEY, refOrigem);
                        }
                    } catch (e) {}
                    return refOrigem;
                }
            }
        } catch (e) {}
        return '';
    }

    function detectarOrigem() {
        var atual = formatarOrigemDaUrlOuReferrer();
        if (atual) return atual;
        try {
            var sessao = sessionStorage.getItem(SESSION_ORIGEM_KEY);
            if (sessao) return sessao;
            var salvoRaw = localStorage.getItem(LAST_UTM_KEY);
            if (salvoRaw) {
                var salvo = JSON.parse(salvoRaw);
                // Janela de atribuição de 7 dias para quem entrou por UTM (GMN ou YouTube) e voltou depois
                if (salvo && salvo.origem && salvo.ts && (Date.now() - salvo.ts) < 7 * 24 * 60 * 60 * 1000) {
                    return salvo.origem;
                }
            }
        } catch (e) {}
        return 'Direto / Orgânico';
    }

    function formatarDataHora(date) {
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return pad(date.getDate()) + '/' +
            pad(date.getMonth() + 1) + '/' +
            date.getFullYear() + ' ' +
            pad(date.getHours()) + ':' +
            pad(date.getMinutes());
    }

    function registrarTriagem(dados) {
        var agora = new Date();
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        var dataStr = pad(agora.getDate()) + '/' + pad(agora.getMonth() + 1) + '/' + agora.getFullYear();
        var horaStr = pad(agora.getHours()) + ':' + pad(agora.getMinutes());
        var lista = getRegistros();
        var novo = {
            id: 'almaeluz_' + agora.getTime() + '_' + Math.random().toString(36).substring(2, 6),
            ts: agora.getTime(),
            timestamp: agora.getTime(),
            data: dataStr,
            hora: horaStr,
            dataHora: formatarDataHora(agora),
            anoMes: agora.getFullYear() + '-' + pad(agora.getMonth() + 1),
            nome: dados.nome || 'Visitante',
            telefone: dados.telefone || 'Não informado',
            email: dados.email || '',
            modalidade: dados.modalidade || 'Atendimento Online',
            preferenciaRetorno: dados.preferenciaRetorno || 'WhatsApp',
            mensagem: dados.mensagem || '',
            pagina: window.location.pathname.split('/').pop() || 'index.html',
            tituloPagina: document.title.split('|')[0].trim(),
            origem: detectarOrigem(),
            botao: dados.botao || 'Botão WhatsApp',
            tipo: dados.tipo || dados.botao || 'WhatsApp Popup'
        };
        lista.unshift(novo);
        salvarRegistros(lista);

        // Envio em background para API Cloudflare (/api/triagem) se disponível (grava no KV e envia e-mail para valeleca@gmail.com)
        try {
            fetch('/api/triagem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(novo),
                keepalive: true
            }).catch(function () {});
        } catch (e) {}

        // Envio opcional para Webhook do Google Sheets se configurado no painel
        try {
            var webhookUrl = localStorage.getItem('almaeluz_sheets_webhook_url');
            if (webhookUrl && webhookUrl.indexOf('https://script.google.com') === 0) {
                fetch(webhookUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(novo),
                    keepalive: true
                }).catch(function () {});
            }
        } catch (e) {}

        return novo;
    }

    // ─── MÁSCARA DE TELEFONE ────────────────────────────────────────────────
    function aplicarMascaraTelefone(valor) {
        var raw = String(valor || '');
        var num = raw.replace(/\D/g, '');
        if (/^\s*\+?55/.test(raw) && num.length >= 12 && num.indexOf('55') === 0) {
            num = num.substring(2);
        } else if ((num.length === 12 || num.length === 13) && num.indexOf('55') === 0) {
            num = num.substring(2);
        }
        if (num.length >= 11 && num.charAt(0) === '0') {
            num = num.substring(1);
        }
        num = num.substring(0, 11);
        if (num.length === 0) return '';
        if (num.length <= 2) return '(' + num;
        if (num.length <= 6) return '(' + num.substring(0, 2) + ') ' + num.substring(2);
        if (num.length <= 10) {
            return '(' + num.substring(0, 2) + ') ' + num.substring(2, 6) + '-' + num.substring(6);
        }
        return '(' + num.substring(0, 2) + ') ' + num.substring(2, 7) + '-' + num.substring(7, 11);
    }

    // ─── ESTILOS DO MODAL DE TRIAGEM (PALETA ALMA E LUZ) ────────────────────
    function injetarEstilosModal() {
        if (document.getElementById('almaeluz-triagem-styles')) return;
        var style = document.createElement('style');
        style.id = 'almaeluz-triagem-styles';
        style.textContent = [
            '.almaeluz-modal-backdrop{position:fixed;inset:0;background:rgba(4,42,55,0.68);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;visibility:hidden;transition:opacity .22s ease,visibility .22s ease;font-family:"Plus Jakarta Sans",sans-serif;}',
            '.almaeluz-modal-backdrop.active{opacity:1;visibility:visible;}',
            '.almaeluz-modal-box{background:#eef9fb;border:2px solid #96cbd6;border-radius:20px;max-width:440px;width:100%;padding:26px 24px 22px;box-shadow:0 24px 60px rgba(4,42,55,0.35);position:relative;transform:translateY(12px) scale(.98);transition:transform .22s ease;color:#083847;}',
            '.almaeluz-modal-backdrop.active .almaeluz-modal-box{transform:translateY(0) scale(1);}',
            '.almaeluz-modal-close{position:absolute;top:14px;right:14px;width:32px;height:32px;border-radius:50%;border:1px solid #b8dfe7;background:#ffffff;color:#042a37;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;}',
            '.almaeluz-modal-close:hover{background:#7c62bd;color:#fff;border-color:#7c62bd;}',
            '.almaeluz-modal-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(124,98,189,0.14);color:#5d439c;border:1px solid rgba(124,98,189,0.3);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:4px 11px;border-radius:50px;margin-bottom:10px;}',
            '.almaeluz-modal-badge span{width:7px;height:7px;background:#25D366;border-radius:50%;display:inline-block;}',
            '.almaeluz-modal-title{font-family:"Lora",Georgia,serif;font-size:21px;font-weight:700;color:#042a37;margin:0 0 6px;line-height:1.28;}',
            '.almaeluz-modal-sub{font-size:13.5px;color:#366372;margin:0 0 16px;line-height:1.5;}',
            '.almaeluz-field{margin-bottom:13px;}',
            '.almaeluz-field label{display:block;font-size:12px;font-weight:700;color:#042a37;margin-bottom:5px;}',
            '.almaeluz-field input,.almaeluz-field select{width:100%;padding:11px 13px;border-radius:10px;border:1.5px solid #96cbd6;background:#ffffff;color:#042a37;font-size:14px;font-family:inherit;outline:none;transition:border-color .2s,box-shadow .2s;box-sizing:border-box;}',
            '.almaeluz-field input:focus,.almaeluz-field select:focus{border-color:#7c62bd;box-shadow:0 0 0 3px rgba(124,98,189,0.18);}',
            '.almaeluz-submit-btn{width:100%;padding:13px 18px;border:none;border-radius:999px;background:#25D366;color:#fff;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;box-shadow:0 6px 20px rgba(37,211,102,0.35);transition:background .2s,transform .15s;margin-top:6px;font-family:inherit;}',
            '.almaeluz-submit-btn:hover{background:#1da851;transform:translateY(-1px);}',
            '.almaeluz-privacy{font-size:11px;color:#366372;text-align:center;margin:11px 0 0;line-height:1.4;}'
        ].join('');
        document.head.appendChild(style);
    }

    // ─── CRIAÇÃO E CONTROLE DO MODAL ────────────────────────────────────────
    var urlDestinoAtual = '';
    var textoBotaoAtual = '';
    var modalIsEnglish = false;
    var modalEl = null;

    function aplicarMascaraTelefoneModal(valor) {
        var raw = String(valor || '');
        // Se estiver no modo em Inglês ou o usuário digitar "+" de DDI internacional diferente de +55, preserva formato internacional
        if (modalIsEnglish || (/^\s*\+/.test(raw) && !/^\s*\+55/.test(raw))) {
            return raw.replace(/[^\d+\-() ]/g, '').substring(0, 22);
        }
        return aplicarMascaraTelefone(raw);
    }

    function configurarIdiomaModal(m, isEn) {
        modalIsEnglish = !!isEn;
        var badge = m.querySelector('.almaeluz-modal-badge');
        var title = m.querySelector('#almaeluz-modal-title');
        var sub = m.querySelector('.almaeluz-modal-sub');
        var lblNome = m.querySelector('label[for="almaeluz-input-nome"]');
        var inputNome = m.querySelector('#almaeluz-input-nome');
        var lblTel = m.querySelector('label[for="almaeluz-input-tel"]');
        var inputTel = m.querySelector('#almaeluz-input-tel');
        var lblMod = m.querySelector('label[for="almaeluz-input-mod"]');
        var selectMod = m.querySelector('#almaeluz-input-mod');
        var btnSubmitSpan = m.querySelector('.almaeluz-submit-btn span');
        var privacy = m.querySelector('.almaeluz-privacy');
        var btnClose = m.querySelector('#almaeluz-modal-close');

        if (modalIsEnglish) {
            if (btnClose) btnClose.setAttribute('aria-label', 'Close');
            if (badge) badge.innerHTML = '<span></span> Online Sessions in English • Valéria Pereira';
            if (title) title.textContent = "Let's Chat on WhatsApp?";
            if (sub) sub.textContent = 'Please enter your name and WhatsApp number below to start our private conversation in English:';
            if (lblNome) lblNome.textContent = 'How would you like to be called? *';
            if (inputNome) inputNome.setAttribute('placeholder', 'Enter your name');
            if (lblTel) lblTel.textContent = 'Your WhatsApp Number (with Country/Area Code) *';
            if (inputTel) inputTel.setAttribute('placeholder', '+1 (555) 000-0000 or +55 (11) 99999-9999');
            if (lblMod) lblMod.textContent = 'Which online session are you looking for?';
            if (selectMod) {
                selectMod.innerHTML =
                    '<option value="Online Individual Therapy (in English)">Online Individual Therapy (in English)</option>' +
                    '<option value="Online Couples Therapy (in English)">Online Couples Therapy (in English)</option>' +
                    '<option value="Stellar Quantum Board / Integrative Therapy (in English)">Stellar Quantum Board / Integrative Therapy</option>' +
                    '<option value="Questions about Online Sessions in English">Questions about Online Sessions in English</option>';
            }
            if (btnSubmitSpan) btnSubmitSpan.textContent = 'Start Conversation with Me on WhatsApp';
            if (privacy) {
                privacy.innerHTML = '🔒 Your data is kept strictly confidential and used solely to reply to you (<a href="/politica-de-privacidade.html" style="color:inherit;text-decoration:underline;">Privacy Policy</a>).';
            }
        } else {
            if (btnClose) btnClose.setAttribute('aria-label', 'Fechar');
            if (badge) badge.innerHTML = '<span></span> Meu Atendimento Online • Valéria Pereira';
            if (title) title.textContent = 'Vamos Conversar no WhatsApp?';
            if (sub) sub.textContent = 'Informe seu nome e WhatsApp abaixo para iniciarmos nossa conversa sobre o seu atendimento online particular:';
            if (lblNome) lblNome.textContent = 'Como você gosta de ser chamado(a)? *';
            if (inputNome) inputNome.setAttribute('placeholder', 'Digite seu nome');
            if (lblTel) lblTel.textContent = 'Seu WhatsApp com DDD *';
            if (inputTel) inputTel.setAttribute('placeholder', '(11) 99999-9999');
            if (lblMod) lblMod.textContent = 'Qual atendimento você busca comigo?';
            if (selectMod) {
                selectMod.innerHTML =
                    '<option value="Terapia Individual Online">Terapia Individual Online</option>' +
                    '<option value="Terapia de Casal Online">Terapia de Casal Online</option>' +
                    '<option value="Mesa Quântica Estelar / Terapias Complementares">Mesa Quântica Estelar / Terapias Complementares</option>' +
                    '<option value="Dúvidas sobre Atendimento Online">Tirar dúvidas sobre o Atendimento Online</option>';
            }
            if (btnSubmitSpan) btnSubmitSpan.textContent = 'Iniciar Conversa Comigo no WhatsApp';
            if (privacy) {
                privacy.innerHTML = '🔒 Seus dados são protegidos com sigilo ético e usados apenas para meu retorno (<a href="/politica-de-privacidade.html" style="color:inherit;text-decoration:underline;">Política de Privacidade</a>).';
            }
        }
    }

    function criarModal() {
        if (modalEl) return modalEl;
        injetarEstilosModal();

        var backdrop = document.createElement('div');
        backdrop.className = 'almaeluz-modal-backdrop';
        backdrop.id = 'almaeluz-triagem-modal';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        backdrop.setAttribute('aria-labelledby', 'almaeluz-modal-title');

        backdrop.innerHTML =
            '<div class="almaeluz-modal-box">' +
                '<button type="button" class="almaeluz-modal-close" id="almaeluz-modal-close" aria-label="Fechar">&times;</button>' +
                '<div class="almaeluz-modal-badge"><span></span> Meu Atendimento Online • Valéria Pereira</div>' +
                '<h3 class="almaeluz-modal-title" id="almaeluz-modal-title">Vamos Conversar no WhatsApp?</h3>' +
                '<p class="almaeluz-modal-sub">Informe seu nome e WhatsApp abaixo para iniciarmos nossa conversa sobre o seu atendimento online particular:</p>' +
                '<form id="almaeluz-triagem-form" novalidate>' +
                    '<div class="almaeluz-field">' +
                        '<label for="almaeluz-input-nome">Como você gosta de ser chamado(a)? *</label>' +
                        '<input type="text" id="almaeluz-input-nome" name="nome" placeholder="Digite seu nome" required autocomplete="name">' +
                    '</div>' +
                    '<div class="almaeluz-field">' +
                        '<label for="almaeluz-input-tel">Seu WhatsApp com DDD *</label>' +
                        '<input type="tel" id="almaeluz-input-tel" name="telefone" placeholder="(11) 99999-9999" required autocomplete="tel">' +
                    '</div>' +
                    '<div class="almaeluz-field">' +
                        '<label for="almaeluz-input-mod">Qual atendimento você busca comigo?</label>' +
                        '<select id="almaeluz-input-mod" name="modalidade">' +
                            '<option value="Terapia Individual Online">Terapia Individual Online</option>' +
                            '<option value="Terapia de Casal Online">Terapia de Casal Online</option>' +
                            '<option value="Mesa Quântica Estelar / Terapias Complementares">Mesa Quântica Estelar / Terapias Complementares</option>' +
                            '<option value="Dúvidas sobre Atendimento Online">Tirar dúvidas sobre o Atendimento Online</option>' +
                        '</select>' +
                    '</div>' +
                    '<button type="submit" class="almaeluz-submit-btn">' +
                        '<svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" style="fill:#ffffff;color:#ffffff;"><path fill="#ffffff" d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>' +
                        '<span>Iniciar Conversa Comigo no WhatsApp</span>' +
                    '</button>' +
                    '<p class="almaeluz-privacy">🔒 Seus dados são protegidos com sigilo ético e usados apenas para meu retorno (<a href="/politica-de-privacidade.html" style="color:inherit;text-decoration:underline;">Política de Privacidade</a>).</p>' +
                '</form>' +
            '</div>';

        document.body.appendChild(backdrop);
        modalEl = backdrop;

        var inputNome = backdrop.querySelector('#almaeluz-input-nome');
        var inputTel = backdrop.querySelector('#almaeluz-input-tel');
        var selectMod = backdrop.querySelector('#almaeluz-input-mod');
        var btnClose = backdrop.querySelector('#almaeluz-modal-close');
        var form = backdrop.querySelector('#almaeluz-triagem-form');

        inputTel.addEventListener('input', function () {
            inputTel.value = aplicarMascaraTelefoneModal(inputTel.value);
        });

        btnClose.addEventListener('click', fecharModal);
        backdrop.addEventListener('click', function (ev) {
            if (ev.target === backdrop) fecharModal();
        });
        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' && backdrop.classList.contains('active')) {
                fecharModal();
            }
        });

        form.addEventListener('submit', function (ev) {
            ev.preventDefault();
            var nomeVal = (inputNome.value || '').trim();
            var telVal = (inputTel.value || '').trim();
            var modVal = selectMod ? selectMod.value : (modalIsEnglish ? 'Online Sessions in English' : 'Atendimento Online');

            if (!nomeVal) {
                inputNome.focus();
                return;
            }
            var minDigits = modalIsEnglish ? 8 : 10;
            if (telVal.replace(/\D/g, '').length < minDigits) {
                inputTel.focus();
                return;
            }

            registrarTriagem({
                nome: nomeVal,
                telefone: telVal,
                modalidade: modVal,
                botao: textoBotaoAtual
            });

            // Personaliza a mensagem do WhatsApp com o nome e modalidade escolhida (em Inglês ou Português conforme o botão clicado)
            var finalUrl = urlDestinoAtual;
            try {
                var u = new URL(urlDestinoAtual);
                if (modalIsEnglish) {
                    var msgOriginalEn = u.searchParams.get('text') || 'Hello Valéria! I visited the Psicanálise Alma e Luz website and would like information about online sessions in English.';
                    var msgPersonalizadaEn = 'Hello, Valéria! My name is ' + nomeVal + ' (' + telVal + '). I am looking for information about ' + modVal + '.\n\n' + msgOriginalEn;
                    u.searchParams.set('text', msgPersonalizadaEn);
                } else {
                    var msgOriginal = u.searchParams.get('text') || 'Olá, Valéria! Vim pelo site Psicanálise Alma e Luz.';
                    var msgPersonalizada = 'Olá, Valéria! Meu nome é ' + nomeVal + ' (' + telVal + '). Busco informações sobre ' + modVal + '.\n\n' + msgOriginal;
                    u.searchParams.set('text', msgPersonalizada);
                }
                finalUrl = u.toString();
            } catch (err) {}

            fecharModal();
            window.open(finalUrl, '_blank', 'noopener,noreferrer');
        });

        return modalEl;
    }

    function abrirModal(urlDestino, textoBotao, isEnglish) {
        urlDestinoAtual = urlDestino;
        textoBotaoAtual = textoBotao || (isEnglish ? 'Online Sessions in English' : 'Contato WhatsApp');
        var m = criarModal();
        configurarIdiomaModal(m, isEnglish);

        // Pré-seleciona a modalidade no select se o botão em português indicar Casal ou Mesa Quântica
        var selectMod = m.querySelector('#almaeluz-input-mod');
        if (!isEnglish && selectMod && textoBotaoAtual) {
            var t = textoBotaoAtual.toLowerCase();
            if (t.indexOf('casal') !== -1) {
                selectMod.value = 'Terapia de Casal Online';
            } else if (t.indexOf('mesa') !== -1 || t.indexOf('quântica') !== -1) {
                selectMod.value = 'Mesa Quântica Estelar / Terapias Complementares';
            } else if (t.indexOf('individual') !== -1) {
                selectMod.value = 'Terapia Individual Online';
            }
        }

        m.classList.add('active');
        setTimeout(function () {
            var inputNome = m.querySelector('#almaeluz-input-nome');
            if (inputNome) inputNome.focus();
        }, 80);
    }

    function fecharModal() {
        if (modalEl) {
            modalEl.classList.remove('active');
        }
    }

    // ─── INTERCEPTAÇÃO DOS LINKS DE WHATSAPP E FORMULÁRIO DE CONTATO ─────────
    function inicializarFormularioContato() {
        var forms = document.querySelectorAll('form[data-valeria-contact-form], #formContatoValeria');
        forms.forEach(function (form) {
            if (form.getAttribute('data-crm-bound') === 'true') return;
            form.setAttribute('data-crm-bound', 'true');

            var telInput = form.querySelector('input[name="telefone"]');
            if (telInput) {
                telInput.addEventListener('input', function () {
                    telInput.value = aplicarMascaraTelefone(telInput.value);
                });
            }

            form.addEventListener('submit', function (ev) {
                ev.preventDefault();
                var nomeEl = form.querySelector('[name="nome"]');
                var telEl = form.querySelector('[name="telefone"]');
                var emailEl = form.querySelector('[name="email"]');
                var modEl = form.querySelector('[name="modalidade"]');
                var prefEl = form.querySelector('[name="preferenciaRetorno"]');
                var msgEl = form.querySelector('[name="mensagem"]');
                var btnSubmit = form.querySelector('button[type="submit"]');
                var feedbackEl = document.getElementById('contatoFormFeedback') || form.querySelector('[data-form-feedback]');

                var nomeVal = nomeEl ? (nomeEl.value || '').trim() : '';
                var telVal = telEl ? (telEl.value || '').trim() : '';
                var emailVal = emailEl ? (emailEl.value || '').trim() : '';
                var modVal = modEl ? (modEl.value || 'Atendimento Online') : 'Atendimento Online';
                var prefVal = prefEl ? (prefEl.value || 'WhatsApp') : 'WhatsApp';
                var msgVal = msgEl ? (msgEl.value || '').trim() : '';

                if (!nomeVal) {
                    if (nomeEl) nomeEl.focus();
                    return;
                }
                if (telVal.replace(/\D/g, '').length < 10) {
                    if (telEl) telEl.focus();
                    return;
                }

                var originalBtnHtml = btnSubmit ? btnSubmit.innerHTML : '';
                if (btnSubmit) {
                    btnSubmit.disabled = true;
                    btnSubmit.innerHTML = '<span>🌸 Enviando sua mensagem com carinho...</span>';
                }

                var lead = registrarTriagem({
                    nome: nomeVal,
                    telefone: telVal,
                    email: emailVal,
                    modalidade: modVal,
                    preferenciaRetorno: prefVal,
                    mensagem: msgVal,
                    botao: 'Formulário de Contato',
                    tipo: 'Formulário de Contato'
                });

                setTimeout(function () {
                    if (btnSubmit) {
                        btnSubmit.disabled = false;
                        btnSubmit.innerHTML = originalBtnHtml;
                    }
                    if (feedbackEl) {
                        var waTexto = encodeURIComponent(
                            'Olá, Valéria! Acabei de enviar uma mensagem pelo Formulário de Contato do site Psicanálise Alma e Luz.\n\n' +
                            'Meu nome é ' + nomeVal + ' (' + telVal + ').\n' +
                            'Interesse: ' + modVal + (msgVal ? '\nMensagem: ' + msgVal : '')
                        );
                        feedbackEl.className = 'contact-feedback-box active';
                        feedbackEl.innerHTML =
                            '<strong>🌸 Recebi sua mensagem com muito carinho, ' + nomeVal.replace(/</g, '&lt;') + '!</strong><br>' +
                            'Seu contato foi registrado com segurança (Protocolo <code>' + lead.id + '</code>) e enviado para o meu e-mail de atendimento. ' +
                            'Retornarei o mais breve possível conforme sua preferência (<strong>' + prefVal.replace(/</g, '&lt;') + '</strong>).<br>' +
                            '<div style="margin-top:12px;">' +
                            '<a href="https://wa.me/5511926755744?text=' + waTexto + '" target="_blank" rel="noopener" data-no-modal="true" class="btn-whatsapp" style="padding:9px 18px;font-size:0.88rem;">' +
                            '💬 Se desejar, clique aqui para já abrir nosso WhatsApp direto' +
                            '</a>' +
                            '</div>';
                        feedbackEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                    form.reset();
                }, 350);
            });
        });
    }

    function inicializarInterceptacao() {
        formatarOrigemDaUrlOuReferrer();
        limparExpirados();
        inicializarFormularioContato();

        document.addEventListener('click', function (ev) {
            var enTagMobile = ev.target.closest('.brand-en-tag');
            if (enTagMobile) {
                ev.preventDefault();
                ev.stopPropagation();
                abrirModal(
                    'https://wa.me/5511926755744?text=Hello%20Val%C3%A9ria!%20I%20visited%20the%20Psican%C3%A1lise%20Alma%20e%20Luz%20website%20and%20would%20like%20information%20about%20online%20sessions%20in%20English.',
                    'Online Sessions also in English',
                    true
                );
                return;
            }

            var link = ev.target.closest('a[href*="wa.me"], a[href*="whatsapp.com"]');
            if (!link) return;

            // Se o link tiver data-no-modal="true" (ex: dentro do próprio painel CRM ou após envio do formulário), não intercepta
            if (link.getAttribute('data-no-modal') === 'true') return;

            ev.preventDefault();
            var href = link.getAttribute('href');
            var label = (link.textContent || link.getAttribute('aria-label') || 'WhatsApp').replace(/\s+/g, ' ').trim();
            var isEn = link.classList.contains('header-en-badge') || link.getAttribute('lang') === 'en';
            abrirModal(href, label, isEn);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarInterceptacao);
    } else {
        inicializarInterceptacao();
    }
})();
