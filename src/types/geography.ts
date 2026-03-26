export interface AdminRegion {
  id: number;
  country_code: string;
  level: number;
  name: string;
  name_ascii: string;
  name_local: string | null;
  parent_id: number | null;
  external_id: string | null;
}

export interface AdminLevelConfig {
  country_code: string;
  level_1_label: string;
  level_2_label: string | null;
  level_3_label: string | null;
  level_4_label: string | null;
  max_level: number;
}
