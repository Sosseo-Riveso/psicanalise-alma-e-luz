import { EmailMessage } from "cloudflare:email";

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(String(str || ''));
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Bloqueio / Redirecionamento imediato de qualquer subdomínio provisório (*.workers.dev) para o domínio oficial
    if (url.hostname.endsWith('.workers.dev')) {
      url.hostname = 'psicanalisealmaeluz.com.br';
      return new Response(null, {
        status: 301,
        headers: {
          'Location': url.toString(),
          'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet'
        }
      });
    }

    // Endpoint de API para salvar, listar e excluir Leads do Mini CRM — Psicanálise Alma e Luz
    if (url.pathname === '/api/triagem') {
      const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      };
      const KV_KEY = 'leads_almaeluz';
      const KV_META_KEY = 'leads_almaeluz_meta';

      // Handler CORS
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // 1) GET: Retornar todos os Leads salvos na Nuvem para o painel-leads.html
      if (request.method === 'GET') {
        try {
          if (!env.LEADS_KV) {
            return new Response(JSON.stringify({ ok: true, leads: [], meta: { clearedAt: 0, deletedSignatures: [] } }), {
              status: 200,
              headers: corsHeaders
            });
          }
          const stored = await env.LEADS_KV.get(KV_KEY, { type: 'json' }) || [];
          const meta = await env.LEADS_KV.get(KV_META_KEY, { type: 'json' }) || { clearedAt: 0, deletedSignatures: [] };
          return new Response(JSON.stringify({ ok: true, leads: stored, meta }), {
            status: 200,
            headers: corsHeaders
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // 2) POST / DELETE: Receber um novo Lead ou executar ação de exclusão/limpeza no KV
      if (request.method === 'POST' || request.method === 'DELETE') {
        try {
          const dados = await request.json().catch(() => ({}));
          const action = String(dados.action || (request.method === 'DELETE' ? 'delete' : 'create')).toLowerCase().trim();

          if (!env.LEADS_KV) {
            return new Response(JSON.stringify({ success: true, warning: 'KV not bound' }), { status: 200, headers: corsHeaders });
          }

          let stored = await env.LEADS_KV.get(KV_KEY, { type: 'json' }) || [];
          let meta = await env.LEADS_KV.get(KV_META_KEY, { type: 'json' }) || { clearedAt: 0, deletedSignatures: [] };
          if (!Array.isArray(meta.deletedSignatures)) meta.deletedSignatures = [];

          const makeSig = (l) => {
            if (!l) return '';
            const tel = String(l.telefone || '').replace(/\D/g, '');
            const dh = String(l.dataHora || '').trim();
            return `${tel}_${dh}`;
          };

          // AÇÃO 1: Limpar todos os leads
          if (action === 'clear' || action === 'clear_all') {
            stored.forEach(l => {
              const s = makeSig(l);
              if (s && s !== '_') meta.deletedSignatures.push(s);
              if (l && (l.id || l.ts)) meta.deletedSignatures.push(String(l.id || l.ts));
            });
            meta.deletedSignatures = Array.from(new Set(meta.deletedSignatures)).slice(-1000);
            meta.clearedAt = Date.now();
            await env.LEADS_KV.put(KV_KEY, JSON.stringify([]));
            await env.LEADS_KV.put(KV_META_KEY, JSON.stringify(meta));
            return new Response(JSON.stringify({ success: true, action: 'clear', remaining: 0, meta }), { status: 200, headers: corsHeaders });
          }

          // AÇÃO 2: Excluir lead individual
          if (action === 'delete' || action === 'delete_one') {
            const targetId = String(dados.id || '').trim();
            const targetSig = String(dados.signature || '').trim();
            const targetPhone = String(dados.telefone || '').replace(/\D/g, '');
            const targetDataHora = String(dados.dataHora || '').trim();

            if (targetSig) meta.deletedSignatures.push(targetSig);
            if (targetId) meta.deletedSignatures.push(targetId);

            stored = stored.filter(l => {
              if (!l) return false;
              const lId = String(l.id || l.ts || '');
              const lSig = makeSig(l);
              if (targetId && lId === targetId) {
                if (lSig) meta.deletedSignatures.push(lSig);
                return false;
              }
              if (targetSig && lSig === targetSig) return false;
              const lPhone = String(l.telefone || '').replace(/\D/g, '');
              if (targetPhone && lPhone === targetPhone && (!targetDataHora || String(l.dataHora || '').trim() === targetDataHora)) {
                if (lSig) meta.deletedSignatures.push(lSig);
                return false;
              }
              return true;
            });

            meta.deletedSignatures = Array.from(new Set(meta.deletedSignatures)).slice(-1000);
            await env.LEADS_KV.put(KV_KEY, JSON.stringify(stored));
            await env.LEADS_KV.put(KV_META_KEY, JSON.stringify(meta));
            return new Response(JSON.stringify({ success: true, action: 'delete', remaining: stored.length, meta }), { status: 200, headers: corsHeaders });
          }

          // AÇÃO 3: Excluir por mês (YYYY-MM)
          if (action === 'delete_month') {
            const targetMonth = String(dados.month || '').trim();
            if (targetMonth) {
              stored = stored.filter(l => {
                if (!l) return false;
                if (String(l.anoMes || '') === targetMonth) {
                  const s = makeSig(l);
                  if (s) meta.deletedSignatures.push(s);
                  if (l.id || l.ts) meta.deletedSignatures.push(String(l.id || l.ts));
                  return false;
                }
                return true;
              });
              meta.deletedSignatures = Array.from(new Set(meta.deletedSignatures)).slice(-1000);
              await env.LEADS_KV.put(KV_KEY, JSON.stringify(stored));
              await env.LEADS_KV.put(KV_META_KEY, JSON.stringify(meta));
            }
            return new Response(JSON.stringify({ success: true, action: 'delete_month', remaining: stored.length, meta }), { status: 200, headers: corsHeaders });
          }

          // AÇÃO 4: Expurgar > 1 ano (365 dias)
          if (action === 'prune_year') {
            const cutoff = Date.now() - (365 * 24 * 60 * 60 * 1000);
            stored = stored.filter(l => {
              if (!l) return false;
              if (l.ts && l.ts < cutoff) {
                const s = makeSig(l);
                if (s) meta.deletedSignatures.push(s);
                if (l.id || l.ts) meta.deletedSignatures.push(String(l.id || l.ts));
                return false;
              }
              return true;
            });
            meta.deletedSignatures = Array.from(new Set(meta.deletedSignatures)).slice(-1000);
            await env.LEADS_KV.put(KV_KEY, JSON.stringify(stored));
            await env.LEADS_KV.put(KV_META_KEY, JSON.stringify(meta));
            return new Response(JSON.stringify({ success: true, action: 'prune_year', remaining: stored.length, meta }), { status: 200, headers: corsHeaders });
          }

          // AÇÃO PADRÃO: Criar novo lead
          const id = dados.id || ('almaeluz_' + Date.now());
          dados.id = id;
          dados.ts = dados.ts || Date.now();
          if (!dados.anoMes) {
            const d = new Date(dados.ts);
            dados.anoMes = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          }

          stored.unshift(dados);
          if (stored.length > 500) stored = stored.slice(0, 500);
          await env.LEADS_KV.put(KV_KEY, JSON.stringify(stored));

          // Disparo de E-mail via Cloudflare Email Routing para a Valéria (valeleca@gmail.com)
          let emailSent = false;
          if (env.SEND_EMAIL) {
            try {
              const siteName = 'Psicanálise Alma e Luz — Valéria Pereira';
              const toEmail = 'valeleca@gmail.com';
              const nome = dados.nome || 'Visitante pelo Site';
              const telefone = dados.telefone || 'Não informado';
              const emailCliente = dados.email || 'Não informado';
              const modalidade = dados.modalidade || 'Atendimento Online';
              const preferenciaRetorno = dados.preferenciaRetorno || 'WhatsApp';
              const mensagem = dados.mensagem || dados.relato || dados.detalhes || 'Contato iniciado pelo site.';
              const pagina = dados.pagina || 'contato.html';
              const tipoCanal = dados.tipo || dados.botao || 'Formulário de Contato';

              const subject = '🌸 Psicanálise Alma e Luz — ' + nome + ' (' + modalidade + ')';
              const subjectHeader = '=?UTF-8?B?' + utf8ToBase64(subject) + '?=';
              const dateStr = new Date().toUTCString();
              const brDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
              const rawPhone = String(telefone).replace(/\D/g, '');

              const htmlBody = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, Helvetica, sans-serif; background-color: #eef9fb; margin: 0; padding: 8px 6px; color: #042a37; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  <div style="width: 100%; max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1.5px solid #96cbd6; box-sizing: border-box;">
    <div style="background: linear-gradient(135deg, #042a37 0%, #6347a6 100%); color: #ffffff; padding: 16px 16px; border-radius: 10px 10px 0 0; box-sizing: border-box;">
      <h2 style="margin: 0; font-size: 18px; line-height: 1.35; word-break: break-word;">🌸 Novo Contato — ${escapeHtml(siteName)}</h2>
      <p style="margin: 6px 0 0; font-size: 12px; line-height: 1.4; opacity: 0.92; word-break: break-word;">Recebido em ${escapeHtml(brDate)} • Canal: ${escapeHtml(tipoCanal)} (${escapeHtml(pagina)})</p>
    </div>
    <div style="padding: 14px 16px; box-sizing: border-box;">
      <div style="padding: 10px 0; border-bottom: 1px solid #eef9fb;">
        <div style="font-size: 12px; font-weight: bold; color: #295666; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 3px;">👤 Nome</div>
        <div style="font-size: 15px; font-weight: bold; color: #042a37; word-break: break-word; overflow-wrap: anywhere; line-height: 1.4;">${escapeHtml(nome)}</div>
      </div>
      <div style="padding: 10px 0; border-bottom: 1px solid #eef9fb;">
        <div style="font-size: 12px; font-weight: bold; color: #295666; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 3px;">📱 Telefone / WhatsApp</div>
        <div style="font-size: 15px; font-weight: bold; color: #128c7e; word-break: break-word; overflow-wrap: anywhere; line-height: 1.4;">${escapeHtml(telefone)}</div>
      </div>
      <div style="padding: 10px 0; border-bottom: 1px solid #eef9fb;">
        <div style="font-size: 12px; font-weight: bold; color: #295666; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 3px;">✉️ E-mail</div>
        <div style="font-size: 15px; color: #042a37; word-break: break-word; overflow-wrap: anywhere; line-height: 1.4;">${escapeHtml(emailCliente)}</div>
      </div>
      <div style="padding: 10px 0; border-bottom: 1px solid #eef9fb;">
        <div style="font-size: 12px; font-weight: bold; color: #295666; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 3px;">🌷 Modalidade Buscada</div>
        <div style="font-size: 15px; font-weight: bold; color: #6347a6; word-break: break-word; overflow-wrap: anywhere; line-height: 1.4;">${escapeHtml(modalidade)}</div>
      </div>
      <div style="padding: 10px 0; border-bottom: 1px solid #eef9fb;">
        <div style="font-size: 12px; font-weight: bold; color: #295666; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 3px;">💬 Retorno Preferido</div>
        <div style="font-size: 15px; color: #042a37; word-break: break-word; overflow-wrap: anywhere; line-height: 1.4;">${escapeHtml(preferenciaRetorno)}</div>
      </div>
      <div style="padding: 10px 0;">
        <div style="font-size: 12px; font-weight: bold; color: #295666; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px;">📝 Mensagem / Relato</div>
        <div style="font-size: 15px; color: #042a37; line-height: 1.55; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(mensagem)}</div>
      </div>
      ${rawPhone ? `<div style="margin-top: 18px; padding-top: 16px; border-top: 1px solid #eef9fb; text-align: center;">
        <a href="https://api.whatsapp.com/send?phone=55${rawPhone}" style="display: block; box-sizing: border-box; width: 100%; max-width: 340px; margin: 0 auto; background-color: #25d366; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 16px; border-radius: 999px; font-size: 14px; text-align: center; word-break: break-word;">💬 Responder no WhatsApp (${escapeHtml(telefone)})</a>
      </div>` : ''}
    </div>
  </div>
</body>
</html>`;

              const bodyB64 = utf8ToBase64(htmlBody).replace(/(.{76})/g, '$1\r\n');
              const buildMime = (senderAddr, domainSuffix) => {
                const fromDisplayHeader = '=?UTF-8?B?' + utf8ToBase64(siteName) + '?= <' + senderAddr + '>';
                const msgId = '<lead-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9) + '@' + domainSuffix + '>';
                const headersList = [
                  'From: ' + fromDisplayHeader,
                  'To: <' + toEmail + '>',
                  'Subject: ' + subjectHeader,
                  'Message-ID: ' + msgId,
                  'Date: ' + dateStr,
                  'MIME-Version: 1.0',
                  'Content-Type: text/html; charset=UTF-8',
                  'Content-Transfer-Encoding: base64'
                ];
                if (emailCliente && emailCliente.includes('@')) {
                  headersList.splice(2, 0, 'Reply-To: <' + emailCliente.trim() + '>');
                }
                return headersList.join('\r\n') + '\r\n\r\n' + bodyB64 + '\r\n';
              };

              try {
                const fromPrimary = 'contato@psicanalisealmaeluz.com.br';
                await env.SEND_EMAIL.send(new EmailMessage(fromPrimary, toEmail, buildMime(fromPrimary, 'psicanalisealmaeluz.com.br')));
                emailSent = true;
              } catch (primaryErr) {
                const fromFallback = 'contato@sosseo.com.br';
                await env.SEND_EMAIL.send(new EmailMessage(fromFallback, toEmail, buildMime(fromFallback, 'sosseo.com.br')));
                emailSent = true;
              }
            } catch (emailErr) {}
          }

          return new Response(JSON.stringify({ success: true, id, emailSent }), {
            status: 200,
            headers: corsHeaders
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: corsHeaders
          });
        }
      }
    }

    // Redirecionamento 301 de www para o domínio canônico sem www (evita duplicação www vs non-www)
    if (url.hostname === 'www.psicanalisealmaeluz.com.br') {
      url.hostname = 'psicanalisealmaeluz.com.br';
      return Response.redirect(url.toString(), 301);
    }

    // Redirecionamento 301 da URL antiga analise-canal para sobre.html
    if (url.pathname === '/analise-canal' || url.pathname === '/analise-canal.html') {
      url.pathname = '/sobre.html';
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === '/sobre') {
      url.pathname = '/sobre.html';
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === '/contato') {
      url.pathname = '/contato.html';
      return Response.redirect(url.toString(), 301);
    }

    // Comportamento padrão: servir os arquivos estáticos do site
    const response = await env.ASSETS.fetch(request);

    // Blindagem anti-indexação para qualquer endereço provisório (*.workers.dev):
    // Impede 100% que o Google indexe páginas ou imagens pelo subdomínio workers.dev
    if (url.hostname.endsWith('.workers.dev')) {
      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    }

    return response;
  }
};
