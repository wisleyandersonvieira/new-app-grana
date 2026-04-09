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
      assinaturas: {
        Row: {
          created_at: string | null
          id: string
          plano: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_fim: string | null
          trial_inicio: string | null
          updated_at: string | null
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          plano?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_fim?: string | null
          trial_inicio?: string | null
          updated_at?: string | null
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          plano?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_fim?: string | null
          trial_inicio?: string | null
          updated_at?: string | null
          usuario_id?: string
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
      despesas: {
        Row: {
          categoria_id: string | null
          competencia: string | null
          conta_id: string | null
          created_at: string | null
          data_pagamento: string | null
          descricao: string
          despesa_pai_id: string | null
          id: string
          observacao: string | null
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
          data_pagamento?: string | null
          descricao: string
          despesa_pai_id?: string | null
          id?: string
          observacao?: string | null
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
          data_pagamento?: string | null
          descricao?: string
          despesa_pai_id?: string | null
          id?: string
          observacao?: string | null
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
          categoria_id: string | null
          competencia: string | null
          created_at: string | null
          data: string | null
          descricao: string
          fatura_id: string
          id: string
          parcela_atual: number | null
          subcategoria_id: string | null
          total_parcelas: number | null
          usuario_id: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          competencia?: string | null
          created_at?: string | null
          data?: string | null
          descricao: string
          fatura_id: string
          id?: string
          parcela_atual?: number | null
          subcategoria_id?: string | null
          total_parcelas?: number | null
          usuario_id: string
          valor: number
        }
        Update: {
          categoria_id?: string | null
          competencia?: string | null
          created_at?: string | null
          data?: string | null
          descricao?: string
          fatura_id?: string
          id?: string
          parcela_atual?: number | null
          subcategoria_id?: string | null
          total_parcelas?: number | null
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
        ]
      }
      metas: {
        Row: {
          categoria_id: string | null
          created_at: string | null
          id: string
          mes_ano: string
          usuario_id: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          created_at?: string | null
          id?: string
          mes_ano: string
          usuario_id: string
          valor: number
        }
        Update: {
          categoria_id?: string | null
          created_at?: string | null
          id?: string
          mes_ano?: string
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
          created_at: string | null
          email: string | null
          id: string
          nome: string | null
          ultimo_acesso: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string | null
          ultimo_acesso?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string | null
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
          data_pagamento: string | null
          descricao: string
          id: string
          observacao: string | null
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
          data_pagamento?: string | null
          descricao: string
          id?: string
          observacao?: string | null
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
          data_pagamento?: string | null
          descricao?: string
          id?: string
          observacao?: string | null
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
          categoria_id: string
          created_at: string | null
          id: string
          nome: string
          usuario_id: string
        }
        Insert: {
          categoria_id: string
          created_at?: string | null
          id?: string
          nome: string
          usuario_id: string
        }
        Update: {
          categoria_id?: string
          created_at?: string | null
          id?: string
          nome?: string
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
      [_ in never]: never
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
