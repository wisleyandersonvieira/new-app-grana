export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_user_logs: {
        Row: {
          acao: string
          admin_id: string | null
          created_at: string
          detalhes: Json
          id: string
          user_id: string
        }
        Insert: {
          acao: string
          admin_id?: string | null
          created_at?: string
          detalhes?: Json
          id?: string
          user_id: string
        }
        Update: {
          acao?: string
          admin_id?: string | null
          created_at?: string
          detalhes?: Json
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      assinaturas: {
        Row: {
          cancel_at: string | null
          cancel_at_period_end: boolean
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          frequencia: string | null
          id: string
          moeda: string | null
          payment_brand: string | null
          payment_exp_month: number | null
          payment_exp_year: number | null
          payment_last4: string | null
          payment_method_type: string | null
          plano: string | null
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          stripe_status: string | null
          stripe_subscription_id: string | null
          synced_at: string | null
          trial_fim: string | null
          trial_inicio: string | null
          updated_at: string | null
          usuario_id: string
          valor: number | null
        }
        Insert: {
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          frequencia?: string | null
          id?: string
          moeda?: string | null
          payment_brand?: string | null
          payment_exp_month?: number | null
          payment_exp_year?: number | null
          payment_last4?: string | null
          payment_method_type?: string | null
          plano?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          synced_at?: string | null
          trial_fim?: string | null
          trial_inicio?: string | null
          updated_at?: string | null
          usuario_id: string
          valor?: number | null
        }
        Update: {
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          frequencia?: string | null
          id?: string
          moeda?: string | null
          payment_brand?: string | null
          payment_exp_month?: number | null
          payment_exp_year?: number | null
          payment_last4?: string | null
          payment_method_type?: string | null
          plano?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          synced_at?: string | null
          trial_fim?: string | null
          trial_inicio?: string | null
          updated_at?: string | null
          usuario_id?: string
          valor?: number | null
        }
        Relationships: []
      }
      billing_invoices: {
        Row: {
          amount_due: number | null
          amount_paid: number | null
          amount_remaining: number | null
          created_at: string
          currency: string | null
          due_date: string | null
          hosted_invoice_url: string | null
          id: string
          invoice_pdf: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          raw_data: Json
          status: string | null
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          stripe_subscription_id: string | null
          synced_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_due?: number | null
          amount_paid?: number | null
          amount_remaining?: number | null
          created_at?: string
          currency?: string | null
          due_date?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          raw_data?: Json
          status?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_subscription_id?: string | null
          synced_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_due?: number | null
          amount_paid?: number | null
          amount_remaining?: number | null
          created_at?: string
          currency?: string | null
          due_date?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          raw_data?: Json
          status?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_subscription_id?: string | null
          synced_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_payment_methods: {
        Row: {
          brand: string | null
          created_at: string
          exp_month: number | null
          exp_year: number | null
          id: string
          is_default: boolean
          last4: string | null
          raw_data: Json
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          synced_at: string
          type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          raw_data?: Json
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          synced_at?: string
          type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          raw_data?: Json
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          synced_at?: string
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_subscriptions: {
        Row: {
          amount: number | null
          cancel_at: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_interval: string | null
          plan_name: string | null
          raw_data: Json
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          stripe_subscription_id: string | null
          synced_at: string
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_interval?: string | null
          plan_name?: string | null
          raw_data?: Json
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          synced_at?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_interval?: string | null
          plan_name?: string | null
          raw_data?: Json
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          synced_at?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bloqueios: {
        Row: {
          created_at: string | null
          id: string
          mes_ano: string
          tipo: string
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          mes_ano: string
          tipo?: string
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          mes_ano?: string
          tipo?: string
          usuario_id?: string
        }
        Relationships: []
      }
      categorias: {
        Row: {
          bloqueada: boolean | null
          categoria_padrao: boolean | null
          created_at: string | null
          id: string
          nome: string
          obrigatoria: boolean | null
          usuario_id: string
        }
        Insert: {
          bloqueada?: boolean | null
          categoria_padrao?: boolean | null
          created_at?: string | null
          id?: string
          nome: string
          obrigatoria?: boolean | null
          usuario_id: string
        }
        Update: {
          bloqueada?: boolean | null
          categoria_padrao?: boolean | null
          created_at?: string | null
          id?: string
          nome?: string
          obrigatoria?: boolean | null
          usuario_id?: string
        }
        Relationships: []
      }
      contas: {
        Row: {
          bloqueada: boolean | null
          created_at: string | null
          data_saldo_inicial: string | null
          id: string
          nome: string
          saldo_inicial: number | null
          tipo: string
          updated_at: string | null
          usuario_id: string
        }
        Insert: {
          bloqueada?: boolean | null
          created_at?: string | null
          data_saldo_inicial?: string | null
          id?: string
          nome: string
          saldo_inicial?: number | null
          tipo?: string
          updated_at?: string | null
          usuario_id: string
        }
        Update: {
          bloqueada?: boolean | null
          created_at?: string | null
          data_saldo_inicial?: string | null
          id?: string
          nome?: string
          saldo_inicial?: number | null
          tipo?: string
          updated_at?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      categorias_sugeridas_cartao: {
        Row: {
          atualizado_em: string
          cartao_id: string
          categoria: string | null
          categoria_id: string | null
          criado_em: string
          descricao_normalizada: string
          id: string
          quantidade_uso: number
          recorrente: boolean
          subcategoria_id: string | null
          ultima_data_uso: string | null
          usuario_id: string
        }
        Insert: {
          atualizado_em?: string
          cartao_id: string
          categoria?: string | null
          categoria_id?: string | null
          criado_em?: string
          descricao_normalizada: string
          id?: string
          quantidade_uso?: number
          recorrente?: boolean
          subcategoria_id?: string | null
          ultima_data_uso?: string | null
          usuario_id: string
        }
        Update: {
          atualizado_em?: string
          cartao_id?: string
          categoria?: string | null
          categoria_id?: string | null
          criado_em?: string
          descricao_normalizada?: string
          id?: string
          quantidade_uso?: number
          recorrente?: boolean
          subcategoria_id?: string | null
          ultima_data_uso?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_sugeridas_cartao_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorias_sugeridas_cartao_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorias_sugeridas_cartao_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas: {
        Row: {
          categoria_id: string | null
          competencia: string | null
          conta_id: string | null
          created_at: string | null
          data: string | null
          data_pagamento: string | null
          descricao: string
          despesa_pai_id: string | null
          id: string
          lote_id: string | null
          observacao: string | null
          paga: boolean | null
          parcela: number | null
          parcela_atual: number | null
          status: string | null
          subcategoria_id: string | null
          total_parcelas: number | null
          updated_at: string | null
          usuario_id: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          competencia?: string | null
          conta_id?: string | null
          created_at?: string | null
          data?: string | null
          data_pagamento?: string | null
          descricao: string
          despesa_pai_id?: string | null
          id?: string
          lote_id?: string | null
          observacao?: string | null
          paga?: boolean | null
          parcela?: number | null
          parcela_atual?: number | null
          status?: string | null
          subcategoria_id?: string | null
          total_parcelas?: number | null
          updated_at?: string | null
          usuario_id: string
          valor: number
        }
        Update: {
          categoria_id?: string | null
          competencia?: string | null
          conta_id?: string | null
          created_at?: string | null
          data?: string | null
          data_pagamento?: string | null
          descricao?: string
          despesa_pai_id?: string | null
          id?: string
          lote_id?: string | null
          observacao?: string | null
          paga?: boolean | null
          parcela?: number | null
          parcela_atual?: number | null
          status?: string | null
          subcategoria_id?: string | null
          total_parcelas?: number | null
          updated_at?: string | null
          usuario_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias"
            referencedColumns: ["id"]
          },
        ]
      }
      faturas_cartao: {
        Row: {
          conta_id: string | null
          created_at: string | null
          data_vencimento: string | null
          id: string
          mes_ano: string
          observacao: string | null
          status: string | null
          updated_at: string | null
          usuario_id: string
          valor_total: number | null
        }
        Insert: {
          conta_id?: string | null
          created_at?: string | null
          data_vencimento?: string | null
          id?: string
          mes_ano: string
          observacao?: string | null
          status?: string | null
          updated_at?: string | null
          usuario_id: string
          valor_total?: number | null
        }
        Update: {
          conta_id?: string | null
          created_at?: string | null
          data_vencimento?: string | null
          id?: string
          mes_ano?: string
          observacao?: string | null
          status?: string | null
          updated_at?: string | null
          usuario_id?: string
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "faturas_cartao_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_fatura: {
        Row: {
          banco_origem: string | null
          categoria_id: string | null
          categoria_sugerida_id: string | null
          competencia: string | null
          created_at: string | null
          data: string | null
          data_compra: string | null
          descricao: string
          descricao_normalizada: string | null
          descricao_original: string | null
          fatura_id: string
          id: string
          importado_pdf: boolean
          observacao_parser: string | null
          parcela_atual: number | null
          parcelas: string | null
          recorrente: boolean
          subcategoria_id: string | null
          subcategoria_sugerida_id: string | null
          sugestao_confianca: number | null
          sugestao_origem: string | null
          total_parcelas: number | null
          updated_at: string | null
          usuario_id: string
          valor: number
        }
        Insert: {
          banco_origem?: string | null
          categoria_id?: string | null
          categoria_sugerida_id?: string | null
          competencia?: string | null
          created_at?: string | null
          data?: string | null
          data_compra?: string | null
          descricao: string
          descricao_normalizada?: string | null
          descricao_original?: string | null
          fatura_id: string
          id?: string
          importado_pdf?: boolean
          observacao_parser?: string | null
          parcela_atual?: number | null
          parcelas?: string | null
          recorrente?: boolean
          subcategoria_id?: string | null
          subcategoria_sugerida_id?: string | null
          sugestao_confianca?: number | null
          sugestao_origem?: string | null
          total_parcelas?: number | null
          updated_at?: string | null
          usuario_id: string
          valor: number
        }
        Update: {
          banco_origem?: string | null
          categoria_id?: string | null
          categoria_sugerida_id?: string | null
          competencia?: string | null
          created_at?: string | null
          data?: string | null
          data_compra?: string | null
          descricao?: string
          descricao_normalizada?: string | null
          descricao_original?: string | null
          fatura_id?: string
          id?: string
          importado_pdf?: boolean
          observacao_parser?: string | null
          parcela_atual?: number | null
          parcelas?: string | null
          recorrente?: boolean
          subcategoria_id?: string | null
          subcategoria_sugerida_id?: string | null
          sugestao_confianca?: number | null
          sugestao_origem?: string | null
          total_parcelas?: number | null
          updated_at?: string | null
          usuario_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_fatura_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_fatura_categoria_sugerida_id_fkey"
            columns: ["categoria_sugerida_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_fatura_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas_cartao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_fatura_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_fatura_subcategoria_sugerida_id_fkey"
            columns: ["subcategoria_sugerida_id"]
            isOneToOne: false
            referencedRelation: "subcategorias"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes_fatura_pdf: {
        Row: {
          atualizado_em: string
          banco_origem: string | null
          cartao_id: string
          competencia: string
          criado_em: string
          fatura_id: string | null
          id: string
          itens_sugeridos: number
          mensagem_erro: string | null
          nome_arquivo: string
          status: string
          total_importado: number
          total_itens_extraidos: number
          usuario_id: string
          vencimento: string
        }
        Insert: {
          atualizado_em?: string
          banco_origem?: string | null
          cartao_id: string
          competencia: string
          criado_em?: string
          fatura_id?: string | null
          id?: string
          itens_sugeridos?: number
          mensagem_erro?: string | null
          nome_arquivo: string
          status?: string
          total_importado?: number
          total_itens_extraidos?: number
          usuario_id: string
          vencimento: string
        }
        Update: {
          atualizado_em?: string
          banco_origem?: string | null
          cartao_id?: string
          competencia?: string
          criado_em?: string
          fatura_id?: string | null
          id?: string
          itens_sugeridos?: number
          mensagem_erro?: string | null
          nome_arquivo?: string
          status?: string
          total_importado?: number
          total_itens_extraidos?: number
          usuario_id?: string
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_fatura_pdf_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_fatura_pdf_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas_cartao"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          categoria_id: string | null
          created_at: string | null
          id: string
          mes_ano: string
          tipo: string | null
          usuario_id: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          created_at?: string | null
          id?: string
          mes_ano: string
          tipo?: string | null
          usuario_id: string
          valor: number
        }
        Update: {
          categoria_id?: string | null
          created_at?: string | null
          id?: string
          mes_ano?: string
          tipo?: string | null
          usuario_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "metas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          access_blocked: boolean
          created_at: string | null
          email: string | null
          empresa: string | null
          id: string
          internal_notes: string | null
          is_admin: boolean | null
          last_login_at: string | null
          nome: string | null
          role: string
          status: string | null
          telefone: string | null
          ultimo_acesso: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_blocked?: boolean
          created_at?: string | null
          email?: string | null
          empresa?: string | null
          id?: string
          internal_notes?: string | null
          is_admin?: boolean | null
          last_login_at?: string | null
          nome?: string | null
          role?: string
          status?: string | null
          telefone?: string | null
          ultimo_acesso?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_blocked?: boolean
          created_at?: string | null
          email?: string | null
          empresa?: string | null
          id?: string
          internal_notes?: string | null
          is_admin?: boolean | null
          last_login_at?: string | null
          nome?: string | null
          role?: string
          status?: string | null
          telefone?: string | null
          ultimo_acesso?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      receitas: {
        Row: {
          categoria_id: string | null
          competencia: string | null
          conta_id: string | null
          created_at: string | null
          data: string | null
          data_pagamento: string | null
          descricao: string
          id: string
          lote_id: string | null
          observacao: string | null
          paga: boolean | null
          parcela: number | null
          status: string | null
          subcategoria_id: string | null
          updated_at: string | null
          usuario_id: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          competencia?: string | null
          conta_id?: string | null
          created_at?: string | null
          data?: string | null
          data_pagamento?: string | null
          descricao: string
          id?: string
          lote_id?: string | null
          observacao?: string | null
          paga?: boolean | null
          parcela?: number | null
          status?: string | null
          subcategoria_id?: string | null
          updated_at?: string | null
          usuario_id: string
          valor: number
        }
        Update: {
          categoria_id?: string | null
          competencia?: string | null
          conta_id?: string | null
          created_at?: string | null
          data?: string | null
          data_pagamento?: string | null
          descricao?: string
          id?: string
          lote_id?: string | null
          observacao?: string | null
          paga?: boolean | null
          parcela?: number | null
          status?: string | null
          subcategoria_id?: string | null
          updated_at?: string | null
          usuario_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "receitas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receitas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receitas_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategorias: {
        Row: {
          bloqueada: boolean | null
          categoria_id: string
          created_at: string | null
          id: string
          nome: string
          obrigatoria: boolean | null
          subcategoria_padrao: boolean | null
          usuario_id: string
        }
        Insert: {
          bloqueada?: boolean | null
          categoria_id: string
          created_at?: string | null
          id?: string
          nome: string
          obrigatoria?: boolean | null
          subcategoria_padrao?: boolean | null
          usuario_id: string
        }
        Update: {
          bloqueada?: boolean | null
          categoria_id?: string
          created_at?: string | null
          id?: string
          nome?: string
          obrigatoria?: boolean | null
          subcategoria_padrao?: boolean | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategorias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencias: {
        Row: {
          conta_destino_id: string | null
          conta_origem_id: string | null
          created_at: string | null
          data: string | null
          id: string
          observacao: string | null
          usuario_id: string
          valor: number
        }
        Insert: {
          conta_destino_id?: string | null
          conta_origem_id?: string | null
          created_at?: string | null
          data?: string | null
          id?: string
          observacao?: string | null
          usuario_id: string
          valor: number
        }
        Update: {
          conta_destino_id?: string | null
          conta_origem_id?: string | null
          created_at?: string | null
          data?: string | null
          id?: string
          observacao?: string | null
          usuario_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_conta_destino_id_fkey"
            columns: ["conta_destino_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_conta_origem_id_fkey"
            columns: ["conta_origem_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
