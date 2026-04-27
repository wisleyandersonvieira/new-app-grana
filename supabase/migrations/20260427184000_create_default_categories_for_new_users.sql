CREATE OR REPLACE FUNCTION public.create_default_categories_for_user(p_usuario_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alimentacao_id UUID;
  v_despesas_fixas_id UUID;
  v_transporte_id UUID;
  v_saude_id UUID;
  v_diversos_id UUID;
  v_receitas_id UUID;
BEGIN
  IF p_usuario_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.categorias
    WHERE usuario_id = p_usuario_id
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.categorias (usuario_id, nome, categoria_padrao, obrigatoria, bloqueada)
  VALUES (p_usuario_id, 'ALIMENTAÇÃO', true, false, false)
  RETURNING id INTO v_alimentacao_id;

  INSERT INTO public.subcategorias (usuario_id, categoria_id, nome, subcategoria_padrao, obrigatoria, bloqueada)
  VALUES
    (p_usuario_id, v_alimentacao_id, 'IFOOD', true, false, false),
    (p_usuario_id, v_alimentacao_id, 'RESTAURANTE', true, false, false),
    (p_usuario_id, v_alimentacao_id, 'MERCADO', true, false, false);

  INSERT INTO public.categorias (usuario_id, nome, categoria_padrao, obrigatoria, bloqueada)
  VALUES (p_usuario_id, 'DESPESAS FIXAS', true, false, false)
  RETURNING id INTO v_despesas_fixas_id;

  INSERT INTO public.subcategorias (usuario_id, categoria_id, nome, subcategoria_padrao, obrigatoria, bloqueada)
  VALUES
    (p_usuario_id, v_despesas_fixas_id, 'ALUGUEL', true, false, false),
    (p_usuario_id, v_despesas_fixas_id, 'CONDOMÍNIO', true, false, false),
    (p_usuario_id, v_despesas_fixas_id, 'ESCOLA', true, false, false),
    (p_usuario_id, v_despesas_fixas_id, 'ENERGIA', true, false, false),
    (p_usuario_id, v_despesas_fixas_id, 'PLANO DE SAÚDE', true, false, false);

  INSERT INTO public.categorias (usuario_id, nome, categoria_padrao, obrigatoria, bloqueada)
  VALUES (p_usuario_id, 'TRANSPORTE', true, false, false)
  RETURNING id INTO v_transporte_id;

  INSERT INTO public.subcategorias (usuario_id, categoria_id, nome, subcategoria_padrao, obrigatoria, bloqueada)
  VALUES
    (p_usuario_id, v_transporte_id, 'COMBUSTÍVEL', true, false, false),
    (p_usuario_id, v_transporte_id, 'UBER', true, false, false),
    (p_usuario_id, v_transporte_id, 'SEGURO VEICULAR', true, false, false),
    (p_usuario_id, v_transporte_id, 'IMPOSTOS', true, false, false),
    (p_usuario_id, v_transporte_id, 'MANUTENÇÃO', true, false, false);

  INSERT INTO public.categorias (usuario_id, nome, categoria_padrao, obrigatoria, bloqueada)
  VALUES (p_usuario_id, 'SAÚDE', true, false, false)
  RETURNING id INTO v_saude_id;

  INSERT INTO public.subcategorias (usuario_id, categoria_id, nome, subcategoria_padrao, obrigatoria, bloqueada)
  VALUES
    (p_usuario_id, v_saude_id, 'CONSULTAS', true, false, false),
    (p_usuario_id, v_saude_id, 'FARMÁCIA', true, false, false),
    (p_usuario_id, v_saude_id, 'NUTRICIONISTA', true, false, false),
    (p_usuario_id, v_saude_id, 'VACINAS', true, false, false),
    (p_usuario_id, v_saude_id, 'DERMATOLOGISTA', true, false, false);

  INSERT INTO public.categorias (usuario_id, nome, categoria_padrao, obrigatoria, bloqueada)
  VALUES (p_usuario_id, 'DIVERSOS', true, false, false)
  RETURNING id INTO v_diversos_id;

  INSERT INTO public.subcategorias (usuario_id, categoria_id, nome, subcategoria_padrao, obrigatoria, bloqueada)
  VALUES
    (p_usuario_id, v_diversos_id, 'TAXAS', true, false, false),
    (p_usuario_id, v_diversos_id, 'JUROS', true, false, false),
    (p_usuario_id, v_diversos_id, 'EXTRAS', true, false, false);

  INSERT INTO public.categorias (usuario_id, nome, categoria_padrao, obrigatoria, bloqueada)
  VALUES (p_usuario_id, 'RECEITAS', true, false, false)
  RETURNING id INTO v_receitas_id;

  INSERT INTO public.subcategorias (usuario_id, categoria_id, nome, subcategoria_padrao, obrigatoria, bloqueada)
  VALUES
    (p_usuario_id, v_receitas_id, 'SALÁRIO', true, false, false),
    (p_usuario_id, v_receitas_id, 'PRÓ LABORE', true, false, false),
    (p_usuario_id, v_receitas_id, 'RECEITAS DIVERSAS', true, false, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_profile_default_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_default_categories_for_user(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_categories_for_profile ON public.profiles;
CREATE TRIGGER trg_create_default_categories_for_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_default_categories();
