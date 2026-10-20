import { EmailMessage } from "cloudflare:email";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Endpoint de API para salvar e listar Leads do Mini CRM — Psicanálise Alma e Luz
    if (url.pathname === '/api/triagem') {
      // Handler CORS
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }

      // 1) GET: Retornar todos os Leads salvos na Nuvem para o painel-leads.html
      if (request.method === 'GET') {
        try {
          if (!env.LEADS_KV) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
          }
          const list = await env.LEADS_KV.list({ prefix: 'lead_' });
          const leads = [];
          for (const key of list.keys) {
            const val = await env.LEADS_KV.get(key.name, { type: 'json' });
            if (val) leads.push(val);
          }
          leads.sort((a, b) => (b.ts || 0) - (a.ts || 0));
          return new Response(JSON.stringify(leads), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), { status: 500 });
        }
      }

      // 2) POST: Receber um novo Lead do site e salvar no KV
      if (request.method === 'POST') {
        try {
          const dados = await request.json();
          const id = dados.id || ('almaeluz_' + Date.now());
          dados.id = id;
          dados.ts = dados.ts || Date.now();

          if (env.LEADS_KV) {
            await env.LEADS_KV.put('lead_' + dados.ts + '_' + id, JSON.stringify(dados));
          }

          return new Response(JSON.stringify({ success: true, id }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
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
