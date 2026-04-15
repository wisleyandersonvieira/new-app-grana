
-- Move despesas from duplicate category to original
UPDATE despesas
SET categoria_id = '77bd960a-2e89-4725-a37c-636e1101215e'
WHERE categoria_id = '6d33a99c-b0a5-483f-85bf-5668f0f808df';

-- Move despesas subcategoria from duplicate to original
UPDATE despesas
SET subcategoria_id = '4aac1061-cdb2-427e-8eb3-458e5b8d666f'
WHERE subcategoria_id = 'b0bf1c0d-4e8b-4a23-bfbd-666d860310dc';

-- Move itens_fatura if any
UPDATE itens_fatura
SET categoria_id = '77bd960a-2e89-4725-a37c-636e1101215e'
WHERE categoria_id = '6d33a99c-b0a5-483f-85bf-5668f0f808df';

UPDATE itens_fatura
SET subcategoria_id = '4aac1061-cdb2-427e-8eb3-458e5b8d666f'
WHERE subcategoria_id = 'b0bf1c0d-4e8b-4a23-bfbd-666d860310dc';

-- Move receitas if any
UPDATE receitas
SET categoria_id = '77bd960a-2e89-4725-a37c-636e1101215e'
WHERE categoria_id = '6d33a99c-b0a5-483f-85bf-5668f0f808df';

UPDATE receitas
SET subcategoria_id = '4aac1061-cdb2-427e-8eb3-458e5b8d666f'
WHERE subcategoria_id = 'b0bf1c0d-4e8b-4a23-bfbd-666d860310dc';

-- Move metas if any
UPDATE metas
SET categoria_id = '77bd960a-2e89-4725-a37c-636e1101215e'
WHERE categoria_id = '6d33a99c-b0a5-483f-85bf-5668f0f808df';

-- Move categorias_sugeridas_cartao if any
UPDATE categorias_sugeridas_cartao
SET categoria_id = '77bd960a-2e89-4725-a37c-636e1101215e'
WHERE categoria_id = '6d33a99c-b0a5-483f-85bf-5668f0f808df';

UPDATE categorias_sugeridas_cartao
SET subcategoria_id = '4aac1061-cdb2-427e-8eb3-458e5b8d666f'
WHERE subcategoria_id = 'b0bf1c0d-4e8b-4a23-bfbd-666d860310dc';

-- Delete duplicate subcategoria
DELETE FROM subcategorias WHERE id = 'b0bf1c0d-4e8b-4a23-bfbd-666d860310dc';

-- Delete duplicate categoria
DELETE FROM categorias WHERE id = '6d33a99c-b0a5-483f-85bf-5668f0f808df';
