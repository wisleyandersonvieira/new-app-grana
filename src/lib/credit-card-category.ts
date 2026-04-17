import { supabase } from '@/integrations/supabase/client';

export const CREDIT_CARD_CATEGORY_NAME = 'Cartão de Crédito';
export const CONSOLIDATED_INVOICE_SUBCATEGORY_NAME = 'Fatura Consolidada';

type CategoryLike = {
  id: string;
  nome: string;
  obrigatoria?: boolean | null;
  usuario_id?: string;
};

type SubcategoryLike = {
  id: string;
  nome: string;
  categoria_id: string;
  obrigatoria?: boolean | null;
  usuario_id?: string;
};

export function normalizeCategoryLabel(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function isCreditCardCategoryName(value: string | null | undefined) {
  return normalizeCategoryLabel(value) === normalizeCategoryLabel(CREDIT_CARD_CATEGORY_NAME);
}

export function isConsolidatedInvoiceSubcategoryName(value: string | null | undefined) {
  return normalizeCategoryLabel(value) === normalizeCategoryLabel(CONSOLIDATED_INVOICE_SUBCATEGORY_NAME);
}

export function findCanonicalCreditCardCategory<T extends CategoryLike>(categories: T[]) {
  return (
    categories.find((category) => category.nome === CREDIT_CARD_CATEGORY_NAME) ??
    categories.find((category) => isCreditCardCategoryName(category.nome)) ??
    null
  );
}

export function findCanonicalConsolidatedSubcategory<T extends SubcategoryLike>(
  subcategories: T[],
  categoryId: string,
) {
  return (
    subcategories.find(
      (subcategory) =>
        subcategory.categoria_id === categoryId &&
        subcategory.nome === CONSOLIDATED_INVOICE_SUBCATEGORY_NAME,
    ) ??
    subcategories.find(
      (subcategory) =>
        subcategory.categoria_id === categoryId &&
        isConsolidatedInvoiceSubcategoryName(subcategory.nome),
    ) ??
    null
  );
}

export async function ensureCanonicalCreditCardCategory(userId: string) {
  const { data: categories, error: categoriesError } = await supabase
    .from('categorias')
    .select('id, nome, obrigatoria')
    .eq('usuario_id', userId)
    .order('created_at');

  if (categoriesError) throw categoriesError;

  const matchingCategories = (categories ?? []).filter((category) => isCreditCardCategoryName(category.nome));
  const preferredCategory =
    matchingCategories.find((category) => category.nome === CREDIT_CARD_CATEGORY_NAME) ??
    matchingCategories[0] ??
    null;

  let canonicalCategory = preferredCategory;

  if (!canonicalCategory) {
    const { data: createdCategory, error: createCategoryError } = await supabase
      .from('categorias')
      .insert({ nome: CREDIT_CARD_CATEGORY_NAME, usuario_id: userId, obrigatoria: true })
      .select('id, nome, obrigatoria')
      .single();

    if (createCategoryError) throw createCategoryError;
    canonicalCategory = createdCategory;
  } else if (canonicalCategory.nome !== CREDIT_CARD_CATEGORY_NAME) {
    const { error: renameCategoryError } = await supabase
      .from('categorias')
      .update({ nome: CREDIT_CARD_CATEGORY_NAME, obrigatoria: true })
      .eq('id', canonicalCategory.id);

    if (renameCategoryError) throw renameCategoryError;
    canonicalCategory = { ...canonicalCategory, nome: CREDIT_CARD_CATEGORY_NAME, obrigatoria: true };
  }

  const { data: subcategories, error: subcategoriesError } = await supabase
    .from('subcategorias')
    .select('id, nome, categoria_id, obrigatoria')
    .eq('usuario_id', userId)
    .order('created_at');

  if (subcategoriesError) throw subcategoriesError;

  const matchingSubcategories = (subcategories ?? []).filter((subcategory) =>
    isConsolidatedInvoiceSubcategoryName(subcategory.nome),
  );
  const preferredSubcategory =
    matchingSubcategories.find(
      (subcategory) =>
        subcategory.categoria_id === canonicalCategory.id &&
        subcategory.nome === CONSOLIDATED_INVOICE_SUBCATEGORY_NAME,
    ) ??
    matchingSubcategories.find((subcategory) => subcategory.categoria_id === canonicalCategory.id) ??
    matchingSubcategories[0] ??
    null;

  let canonicalSubcategory = preferredSubcategory;

  if (!canonicalSubcategory) {
    const { data: createdSubcategory, error: createSubcategoryError } = await supabase
      .from('subcategorias')
      .insert({
        nome: CONSOLIDATED_INVOICE_SUBCATEGORY_NAME,
        categoria_id: canonicalCategory.id,
        usuario_id: userId,
        obrigatoria: true,
      })
      .select('id, nome, categoria_id, obrigatoria')
      .single();

    if (createSubcategoryError) throw createSubcategoryError;
    canonicalSubcategory = createdSubcategory;
  } else if (
    canonicalSubcategory.nome !== CONSOLIDATED_INVOICE_SUBCATEGORY_NAME ||
    canonicalSubcategory.categoria_id !== canonicalCategory.id
  ) {
    const { error: updateSubcategoryError } = await supabase
      .from('subcategorias')
      .update({
        nome: CONSOLIDATED_INVOICE_SUBCATEGORY_NAME,
        categoria_id: canonicalCategory.id,
        obrigatoria: true,
      })
      .eq('id', canonicalSubcategory.id);

    if (updateSubcategoryError) throw updateSubcategoryError;
    canonicalSubcategory = {
      ...canonicalSubcategory,
      nome: CONSOLIDATED_INVOICE_SUBCATEGORY_NAME,
      categoria_id: canonicalCategory.id,
      obrigatoria: true,
    };
  }

  return {
    canonicalCategoryId: canonicalCategory.id,
    canonicalSubcategoryId: canonicalSubcategory.id,
  };
}

export async function sanitizeCreditCardCategoryData(userId: string) {
  const { canonicalCategoryId, canonicalSubcategoryId } = await ensureCanonicalCreditCardCategory(userId);

  const [{ data: categories, error: categoriesError }, { data: subcategories, error: subcategoriesError }] =
    await Promise.all([
      supabase.from('categorias').select('id, nome').eq('usuario_id', userId),
      supabase.from('subcategorias').select('id, nome, categoria_id').eq('usuario_id', userId),
    ]);

  if (categoriesError) throw categoriesError;
  if (subcategoriesError) throw subcategoriesError;

  const allCreditCategoryIds = (categories ?? [])
    .filter((category) => isCreditCardCategoryName(category.nome))
    .map((category) => category.id);
  const duplicateCategoryIds = allCreditCategoryIds.filter((id) => id !== canonicalCategoryId);

  const duplicateSubcategoryIds = (subcategories ?? [])
    .filter(
      (subcategory) =>
        isConsolidatedInvoiceSubcategoryName(subcategory.nome) &&
        allCreditCategoryIds.includes(subcategory.categoria_id) &&
        subcategory.id !== canonicalSubcategoryId,
    )
    .map((subcategory) => subcategory.id);

  if (duplicateCategoryIds.length > 0) {
    const { error: despesasCategoryError } = await supabase
      .from('despesas')
      .update({ categoria_id: canonicalCategoryId })
      .in('categoria_id', duplicateCategoryIds)
      .eq('usuario_id', userId);

    if (despesasCategoryError) throw despesasCategoryError;

    const { error: itensCategoryError } = await supabase
      .from('itens_fatura')
      .update({ categoria_id: canonicalCategoryId })
      .in('categoria_id', duplicateCategoryIds)
      .eq('usuario_id', userId);

    if (itensCategoryError) throw itensCategoryError;
  }

  if (duplicateSubcategoryIds.length > 0) {
    const { error: despesasSubcategoryError } = await supabase
      .from('despesas')
      .update({ subcategoria_id: canonicalSubcategoryId })
      .in('subcategoria_id', duplicateSubcategoryIds)
      .eq('usuario_id', userId);

    if (despesasSubcategoryError) throw despesasSubcategoryError;

    const { error: itensSubcategoryError } = await supabase
      .from('itens_fatura')
      .update({ subcategoria_id: canonicalSubcategoryId })
      .in('subcategoria_id', duplicateSubcategoryIds)
      .eq('usuario_id', userId);

    if (itensSubcategoryError) throw itensSubcategoryError;
  }

  return {
    canonicalCategoryId,
    canonicalSubcategoryId,
    duplicateCategoryIds,
    duplicateSubcategoryIds,
  };
}
