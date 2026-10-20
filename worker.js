import { EmailMessage } from "cloudflare:email";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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

          return new Response(JSON.stringify({ success: true, id }), {
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
