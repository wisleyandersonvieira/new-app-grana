-- Migrate data from duplicate "Cartão De Crédito" (94a59361) to original "Cartão de Crédito" (77bd960a)
-- and from duplicate subcategory (31c146f4) to original (4aac1061)

-- Move despesas
UPDATE public.despesas 
SET categoria_id = '77bd960a-2e89-4725-a37c-636e1101215e'
WHERE categoria_id = '94a59361-a1fb-4341-8b0b-02eb5d416e37';

UPDATE public.despesas 
SET subcategoria_id = '4aac1061-cdb2-427e-8eb3-458e5b8d666f'
WHERE subcategoria_id = '31c146f4-105d-46a6-b340-425c66d3ef00';

-- Move itens_fatura (just in case)
UPDATE public.itens_fatura 
SET categoria_id = '77bd960a-2e89-4725-a37c-636e1101215e'
WHERE categoria_id = '94a59361-a1fb-4341-8b0b-02eb5d416e37';

UPDATE public.itens_fatura 
SET subcategoria_id = '4aac1061-cdb2-427e-8eb3-458e5b8d666f'
WHERE subcategoria_id = '31c146f4-105d-46a6-b340-425c66d3ef00';

-- Move metas
UPDATE public.metas 
SET categoria_id = '77bd960a-2e89-4725-a37c-636e1101215e'
WHERE categoria_id = '94a59361-a1fb-4341-8b0b-02eb5d416e37';

-- Delete duplicate subcategory and category
DELETE FROM public.subcategorias WHERE id = '31c146f4-105d-46a6-b340-425c66d3ef00';
DELETE FROM public.categorias WHERE id = '94a59361-a1fb-4341-8b0b-02eb5d416e37';