import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const envFiles = ['.env.local', '.env'];

for (const file of envFiles) {
  if (!existsSync(file)) continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  const missing = [
    !supabaseUrl && 'SUPABASE_URL or VITE_SUPABASE_URL',
    !anonKey && 'SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY',
    !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);
  console.error(
    [
      'Missing Supabase credentials for the A/B RLS test.',
      `Missing: ${missing.join(', ')}.`,
      'Required: SUPABASE_URL or VITE_SUPABASE_URL, SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY.',
      'Run this only against a disposable/staging project or a production project with explicit approval.',
    ].join('\n'),
  );
  process.exit(2);
}

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const anon = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Rls-Ab-Test-${runId}!`;
const users = [];
const createdRows = [];
const results = [];

const defaultCategories = new Map([
  ['ALIMENTAÇÃO', ['IFOOD', 'RESTAURANTE', 'MERCADO']],
  ['DESPESAS FIXAS', ['ALUGUEL', 'CONDOMÍNIO', 'ESCOLA', 'ENERGIA', 'PLANO DE SAÚDE']],
  ['TRANSPORTE', ['COMBUSTÍVEL', 'UBER', 'SEGURO VEICULAR', 'IMPOSTOS', 'MANUTENÇÃO']],
  ['SAÚDE', ['CONSULTAS', 'FARMÁCIA', 'NUTRICIONISTA', 'VACINAS', 'DERMATOLOGISTA']],
  ['DIVERSOS', ['TAXAS', 'JUROS', 'EXTRAS']],
  ['RECEITAS', ['SALÁRIO', 'PRÓ LABORE', 'RECEITAS DIVERSAS']],
]);

function mark(name, expected, passed, details = '') {
  results.push({ name, expected, passed, details });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`${status} | ${name} | esperado: ${expected}${details ? ` | ${details}` : ''}`);
}

async function createUser(label) {
  const email = `security+${label}-${runId}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { security_test: runId, label },
  });
  if (error) throw new Error(`Failed to create ${label}: ${error.message}`);
  users.push(data.user.id);

  const { data: sessionData, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Failed to sign in ${label}: ${signInError.message}`);

  return {
    id: data.user.id,
    email,
    client: createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      },
    }),
  };
}

async function insertOwned(client, table, row) {
  const { data, error } = await client.from(table).insert(row).select('*').single();
  if (error) throw new Error(`Insert ${table} failed: ${error.message}`);
  createdRows.push({ table, id: data.id });
  return data;
}

function blockedByRls(error) {
  if (!error) return false;
  return /row-level security|permission denied|violates row-level security|Invalid .* reference/i.test(error.message);
}

async function expectNoRead(client, table, id) {
  const { data, error } = await client.from(table).select('*').eq('id', id);
  const passed = !error && Array.isArray(data) && data.length === 0;
  mark(`${table}: usuario A nao le registro do usuario B`, '0 linhas', passed, error?.message || `${data.length} linhas`);
}

async function expectNoUpdate(client, table, id, patch) {
  const { data, error } = await client.from(table).update(patch).eq('id', id).select('id');
  const passed = blockedByRls(error) || (!error && Array.isArray(data) && data.length === 0);
  mark(`${table}: usuario A nao altera registro do usuario B`, 'bloqueio ou 0 linhas', passed, error?.message || `${data.length} linhas`);
}

async function expectNoDelete(client, table, id) {
  const { data, error } = await client.from(table).delete().eq('id', id).select('id');
  const passed = blockedByRls(error) || (!error && Array.isArray(data) && data.length === 0);
  mark(`${table}: usuario A nao exclui registro do usuario B`, 'bloqueio ou 0 linhas', passed, error?.message || `${data.length} linhas`);
}

async function expectRejected(name, action) {
  const { error } = await action();
  mark(name, 'erro de RLS/integridade', Boolean(error), error?.message || 'operacao aceita indevidamente');
}

async function expectAccepted(name, action) {
  const { data, error } = await action();
  if (data?.id) createdRows.push({ table: 'despesas', id: data.id });
  mark(name, 'operacao aceita', !error, error?.message || data?.id || 'ok');
}

async function expectDefaultCategories(user) {
  const { data, error } = await user.client
    .from('categorias')
    .select('nome, categoria_padrao, subcategorias(nome, subcategoria_padrao)')
    .eq('usuario_id', user.id)
    .in('nome', [...defaultCategories.keys()]);

  if (error) {
    mark('onboarding: cria categorias padrao para novo usuario', '6 categorias e 26 subcategorias', false, error.message);
    return;
  }

  const categoryMap = new Map((data ?? []).map((category) => [category.nome, category]));
  const missing = [];

  for (const [categoryName, expectedSubcategories] of defaultCategories) {
    const category = categoryMap.get(categoryName);
    if (!category?.categoria_padrao) {
      missing.push(categoryName);
      continue;
    }

    const actualSubcategories = new Set(
      (category.subcategorias ?? [])
        .filter((subcategory) => subcategory.subcategoria_padrao)
        .map((subcategory) => subcategory.nome),
    );

    for (const subcategoryName of expectedSubcategories) {
      if (!actualSubcategories.has(subcategoryName)) {
        missing.push(`${categoryName} > ${subcategoryName}`);
      }
    }
  }

  mark(
    'onboarding: cria categorias padrao para novo usuario',
    '6 categorias e 26 subcategorias',
    missing.length === 0,
    missing.length === 0 ? 'ok' : `faltando: ${missing.join(', ')}`,
  );
}

async function main() {
  const userA = await createUser('user-a');
  const userB = await createUser('user-b');

  await expectDefaultCategories(userA);
  await expectDefaultCategories(userB);

  const contaA = await insertOwned(userA.client, 'contas', {
    usuario_id: userA.id,
    nome: `Conta A ${runId}`,
    tipo: 'corrente',
  });
  const contaB = await insertOwned(userB.client, 'contas', {
    usuario_id: userB.id,
    nome: `Conta B ${runId}`,
    tipo: 'corrente',
  });
  const categoriaA = await insertOwned(userA.client, 'categorias', {
    usuario_id: userA.id,
    nome: `Categoria A ${runId}`,
  });
  const categoriaB = await insertOwned(userB.client, 'categorias', {
    usuario_id: userB.id,
    nome: `Categoria B ${runId}`,
  });
  const receitaB = await insertOwned(userB.client, 'receitas', {
    usuario_id: userB.id,
    descricao: `Receita B ${runId}`,
    valor: 123,
    competencia: '2026-04-01',
    conta_id: contaB.id,
    categoria_id: categoriaB.id,
  });
  const despesaB = await insertOwned(userB.client, 'despesas', {
    usuario_id: userB.id,
    descricao: `Despesa B ${runId}`,
    valor: 45,
    competencia: '2026-04-01',
    conta_id: contaB.id,
    categoria_id: categoriaB.id,
  });
  const transferenciaB = await insertOwned(userB.client, 'transferencias', {
    usuario_id: userB.id,
    conta_origem_id: contaB.id,
    conta_destino_id: contaB.id,
    valor: 10,
    data: '2026-04-01',
  });
  const faturaB = await insertOwned(userB.client, 'faturas_cartao', {
    usuario_id: userB.id,
    conta_id: contaB.id,
    mes_ano: `2026-04-${runId.slice(0, 8)}`,
    status: 'aberta',
  });

  for (const [table, id, patch] of [
    ['contas', contaB.id, { nome: 'HACKED' }],
    ['categorias', categoriaB.id, { nome: 'HACKED' }],
    ['receitas', receitaB.id, { descricao: 'HACKED' }],
    ['despesas', despesaB.id, { descricao: 'HACKED' }],
    ['transferencias', transferenciaB.id, { observacao: 'HACKED' }],
    ['faturas_cartao', faturaB.id, { status: 'fechada' }],
  ]) {
    await expectNoRead(userA.client, table, id);
    await expectNoUpdate(userA.client, table, id, patch);
    await expectNoDelete(userA.client, table, id);
  }

  await expectRejected('receitas: usuario A nao cria registro apontando para conta/categoria B', () =>
    userA.client.from('receitas').insert({
      usuario_id: userA.id,
      descricao: `Cross ref receita ${runId}`,
      valor: 1,
      competencia: '2026-04-01',
      conta_id: contaB.id,
      categoria_id: categoriaB.id,
    }),
  );

  await expectRejected('despesas: usuario A nao cria registro apontando para categoria B', () =>
    userA.client.from('despesas').insert({
      usuario_id: userA.id,
      descricao: `Cross ref despesa ${runId}`,
      valor: 1,
      competencia: '2026-04-01',
      conta_id: contaA.id,
      categoria_id: categoriaB.id,
    }),
  );

  await expectRejected('despesas: usuario A nao cria despesa vinculada a fatura B por lote_id', () =>
    userA.client.from('despesas').insert({
      usuario_id: userA.id,
      descricao: `Cross ref despesa lote ${runId}`,
      valor: 1,
      competencia: '2026-04-01',
      conta_id: contaA.id,
      categoria_id: categoriaA.id,
      lote_id: faturaB.id,
    }),
  );

  await expectAccepted('despesas: usuario A cria despesa com lote_id UUID sem fatura associada', () =>
    userA.client.from('despesas').insert({
      usuario_id: userA.id,
      descricao: `Despesa lote normal ${runId}`,
      valor: 1,
      competencia: '2026-04-01',
      conta_id: contaA.id,
      categoria_id: categoriaA.id,
      lote_id: randomUUID(),
    }).select('id').single(),
  );

  await expectRejected('faturas_cartao: usuario A nao cria fatura apontando para conta B', () =>
    userA.client.from('faturas_cartao').insert({
      usuario_id: userA.id,
      conta_id: contaB.id,
      mes_ano: `2026-05-${runId.slice(0, 8)}`,
    }),
  );

  await expectRejected('transferencias: usuario A nao cria transferencia para conta B', () =>
    userA.client.from('transferencias').insert({
      usuario_id: userA.id,
      conta_origem_id: contaA.id,
      conta_destino_id: contaB.id,
      valor: 1,
      data: '2026-04-01',
    }),
  );

  await expectRejected('itens_fatura: usuario A nao cria item em fatura B', () =>
    userA.client.from('itens_fatura').insert({
      usuario_id: userA.id,
      fatura_id: faturaB.id,
      descricao: `Cross ref item ${runId}`,
      valor: 1,
    }),
  );

  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) {
    console.error(`\nRLS A/B test failed: ${failed.length} failure(s).`);
    process.exitCode = 1;
  } else {
    console.log(`\nRLS A/B test passed: ${results.length} assertions.`);
  }
}

async function cleanup() {
  for (const userId of users) {
    await service.auth.admin.deleteUser(userId).catch(() => undefined);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);
