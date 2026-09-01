// Hand-authored to match supabase/migrations/0001_schema.sql.
// Once the Supabase project exists, regenerate with:
//   pnpm dlx supabase gen types typescript --project-id <project-id> > src/lib/supabase/types.ts

export type Modalidad = "Obra Gruesa Habitable" | "Llave en Mano";
export type EstadoProyecto = "En curso" | "Terminado" | "Pausado";
export type EstadoEtapa = "pendiente" | "en_curso" | "terminada";
export type TipoTecho = "Mediterráneo" | "Inclinado";
export type OpcionTechoInclinado = "Teja asfáltica" | "Zinc prepintado";
export type EscalaPor = "m2" | "banos" | "fijo";
export type CategoriaGasto = "Material" | "Mano de Obra";
export type Rol = "admin" | "usuario";

export interface Database {
  public: {
    Tables: {
      catalogo_etapas: {
        Row: {
          id: number;
          modalidad: Modalidad;
          orden: number;
          nombre: string;
          duracion_semanas_est: number;
          lead_time_dias_compra: number;
          es_paralelo: boolean;
        };
        Insert: {
          id?: number;
          modalidad: Modalidad;
          orden: number;
          nombre: string;
          duracion_semanas_est: number;
          lead_time_dias_compra: number;
          es_paralelo?: boolean;
        };
        Update: {
          id?: number;
          modalidad?: Modalidad;
          orden?: number;
          nombre?: string;
          duracion_semanas_est?: number;
          lead_time_dias_compra?: number;
          es_paralelo?: boolean;
        };
        Relationships: [];
      };
      catalogo_materiales: {
        Row: {
          id: number;
          etapa_id: number | null;
          material: string;
          unidad_default: string;
          escala_por: EscalaPor;
        };
        Insert: {
          id?: number;
          etapa_id?: number | null;
          material: string;
          unidad_default: string;
          escala_por?: EscalaPor;
        };
        Update: {
          id?: number;
          etapa_id?: number | null;
          material?: string;
          unidad_default?: string;
          escala_por?: EscalaPor;
        };
        Relationships: [];
      };
      proyectos: {
        Row: {
          id: string;
          nombre: string;
          modalidad: Modalidad;
          m2: number;
          n_dormitorios: number | null;
          n_banos: number | null;
          tiene_logia: boolean;
          tiene_deck: boolean;
          fecha_inicio: string;
          fecha_termino_estimada: string | null;
          presupuesto_total: number;
          contrato: number;
          anexo_1: number;
          anexo_2: number;
          cliente: string | null;
          estado: EstadoProyecto;
          es_proyecto_referencia_m2: boolean;
          tipo_techo: TipoTecho | null;
          opcion_techo_inclinado: OpcionTechoInclinado | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          modalidad: Modalidad;
          m2: number;
          n_dormitorios?: number | null;
          n_banos?: number | null;
          tiene_logia?: boolean;
          tiene_deck?: boolean;
          fecha_inicio: string;
          fecha_termino_estimada?: string | null;
          presupuesto_total: number;
          contrato?: number;
          anexo_1?: number;
          anexo_2?: number;
          cliente?: string | null;
          estado?: EstadoProyecto;
          es_proyecto_referencia_m2?: boolean;
          tipo_techo?: TipoTecho | null;
          opcion_techo_inclinado?: OpcionTechoInclinado | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          modalidad?: Modalidad;
          m2?: number;
          n_dormitorios?: number | null;
          n_banos?: number | null;
          tiene_logia?: boolean;
          tiene_deck?: boolean;
          fecha_inicio?: string;
          fecha_termino_estimada?: string | null;
          presupuesto_total?: number;
          contrato?: number;
          anexo_1?: number;
          anexo_2?: number;
          cliente?: string | null;
          estado?: EstadoProyecto;
          es_proyecto_referencia_m2?: boolean;
          tipo_techo?: TipoTecho | null;
          opcion_techo_inclinado?: OpcionTechoInclinado | null;
          created_at?: string;
        };
        Relationships: [];
      };
      proyecto_etapas: {
        Row: {
          id: string;
          proyecto_id: string;
          etapa_id: number;
          fecha_inicio_plan: string | null;
          fecha_fin_plan: string | null;
          fecha_inicio_real: string | null;
          fecha_fin_real: string | null;
          estado: EstadoEtapa;
        };
        Insert: {
          id?: string;
          proyecto_id: string;
          etapa_id: number;
          fecha_inicio_plan?: string | null;
          fecha_fin_plan?: string | null;
          fecha_inicio_real?: string | null;
          fecha_fin_real?: string | null;
          estado?: EstadoEtapa;
        };
        Update: {
          id?: string;
          proyecto_id?: string;
          etapa_id?: number;
          fecha_inicio_plan?: string | null;
          fecha_fin_plan?: string | null;
          fecha_inicio_real?: string | null;
          fecha_fin_real?: string | null;
          estado?: EstadoEtapa;
        };
        Relationships: [];
      };
      gastos: {
        Row: {
          id: string;
          proyecto_id: string;
          etapa_id: number | null;
          factura_id: string | null;
          transferencia_id: string | null;
          categoria: CategoriaGasto;
          material: string | null;
          cantidad: number | null;
          unidad: string | null;
          costo_unitario: number | null;
          monto_total: number;
          proveedor: string | null;
          n_documento: string | null;
          foto_boleta_url: string | null;
          registrado_por: string | null;
          reembolso: boolean;
          notas: string | null;
          fecha: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          proyecto_id: string;
          etapa_id?: number | null;
          factura_id?: string | null;
          transferencia_id?: string | null;
          categoria: CategoriaGasto;
          material?: string | null;
          cantidad?: number | null;
          unidad?: string | null;
          costo_unitario?: number | null;
          monto_total: number;
          proveedor?: string | null;
          n_documento?: string | null;
          foto_boleta_url?: string | null;
          registrado_por?: string | null;
          reembolso?: boolean;
          notas?: string | null;
          fecha: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          proyecto_id?: string;
          etapa_id?: number | null;
          factura_id?: string | null;
          transferencia_id?: string | null;
          categoria?: CategoriaGasto;
          material?: string | null;
          cantidad?: number | null;
          unidad?: string | null;
          costo_unitario?: number | null;
          monto_total?: number;
          proveedor?: string | null;
          n_documento?: string | null;
          foto_boleta_url?: string | null;
          registrado_por?: string | null;
          reembolso?: boolean;
          notas?: string | null;
          fecha?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      facturas: {
        Row: {
          id: string;
          proyecto_id: string;
          proveedor: string | null;
          n_documento: string | null;
          fecha: string;
          foto_url: string | null;
          monto_total: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          proyecto_id: string;
          proveedor?: string | null;
          n_documento?: string | null;
          fecha: string;
          foto_url?: string | null;
          monto_total?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          proyecto_id?: string;
          proveedor?: string | null;
          n_documento?: string | null;
          fecha?: string;
          foto_url?: string | null;
          monto_total?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      transferencias: {
        Row: {
          id: string;
          proyecto_id: string;
          destinatario: string | null;
          n_operacion: string | null;
          fecha: string;
          foto_url: string | null;
          monto_total: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          proyecto_id: string;
          destinatario?: string | null;
          n_operacion?: string | null;
          fecha: string;
          foto_url?: string | null;
          monto_total?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          proyecto_id?: string;
          destinatario?: string | null;
          n_operacion?: string | null;
          fecha?: string;
          foto_url?: string | null;
          monto_total?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          role: Rol;
        };
        Insert: {
          id: string;
          role?: Rol;
        };
        Update: {
          id?: string;
          role?: Rol;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
