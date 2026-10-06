// Database types, generated from the live Supabase schema (Supabase MCP generate_typescript_types).
// Regenerate after every migration; don't edit by hand.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// Foreign keys, exactly as Supabase names them: they let joined selects like "player:players(*)" be typed.
type FK<Name extends string, Col extends string, Ref extends string> = {
  foreignKeyName: Name; columns: [Col]; isOneToOne: false; referencedRelation: Ref; referencedColumns: ["id"];
};
type Table<Row, Insert, Rel extends FK<string, string, string>[] = []> = { Row: Row; Insert: Insert; Update: Partial<Insert>; Relationships: Rel };

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      app_secrets: Table<{ key: string; value: string }, { key: string; value: string }>;
      activity: Table<{ created_at: string; id: number; kind: string; message: string }, { created_at?: string; kind: string; message: string }>;
      bid_sessions: Table<{ created_at: string; team_id: string; token: string }, { created_at?: string; team_id: string; token: string },
        [FK<"bid_sessions_team_id_fkey", "team_id", "teams">]
      >;
      bids: Table<
        { amount: number; created_at: string; id: string; player_id: string; round_id: string; team_id: string; years: number },
        { amount: number; created_at?: string; id?: string; player_id: string; round_id: string; team_id: string; years: number },
        [FK<"bids_player_id_fkey", "player_id", "players">, FK<"bids_round_id_fkey", "round_id", "rounds">, FK<"bids_team_id_fkey", "team_id", "teams">]
      >;
      cap_adjustments: Table<
        { active: boolean; amount: number; created_at: string; id: string; reason: string; team_id: string },
        { active?: boolean; amount: number; created_at?: string; id?: string; reason: string; team_id: string },
        [FK<"cap_adjustments_team_id_fkey", "team_id", "teams">]
      >;
      draft_picks: Table<
        { id: string; original_team: string; picked_at: string | null; player_id: string | null; slot: number | null; team_id: string; year: number },
        { id?: string; original_team: string; picked_at?: string | null; player_id?: string | null; slot?: number | null; team_id: string; year: number },
        [FK<"draft_picks_original_team_fkey", "original_team", "teams">, FK<"draft_picks_team_id_fkey", "team_id", "teams">, FK<"draft_picks_player_id_fkey", "player_id", "players">]
      >;
      rookie_lotteries: Table<{ drawn_at: string; odds: Json; year: number }, { drawn_at?: string; odds: Json; year: number }>;
      rookie_lottery_views: Table<
        { seen_at: string; team_id: string; year: number },
        { seen_at?: string; team_id: string; year: number },
        [FK<"rookie_lottery_views_team_id_fkey", "team_id", "teams">]
      >;
      contracts: Table<
        { acquired_via: string; active: boolean; created_at: string; id: string; player_id: string; salary: number; season_signed: number; team_id: string; years: number },
        { acquired_via?: string; active?: boolean; created_at?: string; id?: string; player_id: string; salary: number; season_signed: number; team_id: string; years: number },
        [FK<"contracts_player_id_fkey", "player_id", "players">, FK<"contracts_team_id_fkey", "team_id", "teams">]
      >;
      extension_decisions: Table<
        { decided_at: string; players: string[]; season: number; team_id: string },
        { decided_at?: string; players?: string[]; season: number; team_id: string },
        [FK<"extension_decisions_team_id_fkey", "team_id", "teams">]
      >;
      games: Table<
        { away_score: number | null; away_team_id: string; final: boolean; home_score: number | null; home_team_id: string; id: string; season_type: number | null; start: string; state: string; updated_at: string },
        { away_score?: number | null; away_team_id: string; final?: boolean; home_score?: number | null; home_team_id: string; id: string; season_type?: number | null; start: string; state: string; updated_at?: string }
      >;
      lineup_points: Table<
        { day: string; fpts: number; games: number; player_id: string; slot: string; team_id: string },
        { day: string; fpts?: number; games?: number; player_id: string; slot: string; team_id: string },
        [FK<"lineup_points_player_id_fkey", "player_id", "players">, FK<"lineup_points_team_id_fkey", "team_id", "teams">]
      >;
      lineups: Table<{ day: string; player_id: string; saved_at: string; slot: string; team_id: string }, { day: string; player_id: string; saved_at?: string; slot: string; team_id: string },
        [FK<"lineups_player_id_fkey", "player_id", "players">, FK<"lineups_team_id_fkey", "team_id", "teams">]
      >;
      matchups: Table<
        { away_team_id: string | null; ends: string; home_team_id: string | null; id: string; is_test: boolean; round: string; season: number; starts: string; week: number },
        { away_team_id?: string | null; ends: string; home_team_id?: string | null; id?: string; is_test?: boolean; round?: string; season: number; starts: string; week: number },
        [FK<"matchups_away_team_id_fkey", "away_team_id", "teams">, FK<"matchups_home_team_id_fkey", "home_team_id", "teams">]
      >;
      player_games: Table<
        {
          ast: number; blk: number; ej: number; fga: number; fgm: number; fpts: number; game_id: string; min: number; nba_team_id: string;
          played: boolean; player_id: string; pts: number; reb: number; stl: number; tf: number; tov: number; updated_at: string; win: number;
        },
        {
          ast?: number; blk?: number; ej?: number; fga?: number; fgm?: number; fpts?: number; game_id: string; min?: number; nba_team_id: string;
          played: boolean; player_id: string; pts?: number; reb?: number; stl?: number; tf?: number; tov?: number; updated_at?: string; win?: number;
        },
        [FK<"player_games_game_id_fkey", "game_id", "games">]
      >;
      players: Table<
        {
          espn_salary: number | null; headshot: string | null; id: string; injury_note: string | null; injury_status: string | null; last_season: Json | null;
          name: string; nba_team: string | null; nba_team_id: string | null; position: string | null; projection: Json | null; rank: number | null; updated_at: string;
        },
        {
          espn_salary?: number | null; headshot?: string | null; id: string; injury_note?: string | null; injury_status?: string | null; last_season?: Json | null;
          name: string; nba_team?: string | null; nba_team_id?: string | null; position?: string | null; projection?: Json | null; rank?: number | null; updated_at?: string;
        }
      >;
      renounces: Table<
        { bid_id: string; block: number; created_at: string; id: string; round_id: string; season: number; team_id: string },
        { bid_id: string; block: number; created_at?: string; id?: string; round_id: string; season: number; team_id: string },
        [FK<"renounces_bid_id_fkey", "bid_id", "bids">, FK<"renounces_round_id_fkey", "round_id", "rounds">, FK<"renounces_team_id_fkey", "team_id", "teams">]
      >;
      push_subscriptions: Table<
        { auth: string; created_at: string; endpoint: string; p256dh: string; team_id: string },
        { auth: string; created_at?: string; endpoint: string; p256dh: string; team_id: string },
        [FK<"push_subscriptions_team_id_fkey", "team_id", "teams">]
      >;
      round_players: Table<{ player_id: string; pos: number; round_id: string }, { player_id: string; pos?: number; round_id: string },
        [FK<"round_players_player_id_fkey", "player_id", "players">, FK<"round_players_round_id_fkey", "round_id", "rounds">]
      >;
      rounds: Table<
        { closes_at: string | null; created_at: string; id: string; kind: string; number: number; opens_at: string | null; result: Json | null; season: number; settles_at: string | null; status: string },
        { closes_at?: string | null; created_at?: string; id?: string; kind?: string; number: number; opens_at?: string | null; result?: Json | null; season: number; settles_at?: string | null; status?: string }
      >;
      settings: Table<
        { cap: number; fa_locked: boolean; fa_schedule: Json | null; id: number; league_name: string; league_size: number; min_salary: number; roster_max: number; round_seconds: number; scoring: Json; season: number; waiver_hours: number },
        { cap?: number; fa_locked?: boolean; fa_schedule?: Json | null; id?: number; league_name?: string; league_size?: number; min_salary?: number; roster_max?: number; round_seconds?: number; scoring?: Json; season?: number; waiver_hours?: number }
      >;
      sync_log: Table<{ last_run: string; name: string }, { last_run: string; name: string }>;
      teams: Table<
        { created_at: string; id: string; is_commish: boolean; manager_email: string; manager_name: string | null; name: string; user_id: string | null },
        { created_at?: string; id?: string; is_commish?: boolean; manager_email: string; manager_name?: string | null; name: string; user_id?: string | null }
      >;
      trade_offers: Table<
        {
          created_at: string; decided_at: string | null; from_team: string; get: string[]; get_picks: string[]; give: string[]; give_picks: string[]; id: string;
          season: number; status: string; to_team: string;
        },
        {
          created_at?: string; decided_at?: string | null; from_team: string; get?: string[]; get_picks?: string[]; give?: string[]; give_picks?: string[]; id?: string;
          season: number; status?: string; to_team: string;
        },
        [FK<"trade_offers_from_team_fkey", "from_team", "teams">, FK<"trade_offers_to_team_fkey", "to_team", "teams">]
      >;
      transactions: Table<
        {
          contract_id: string | null; created_at: string; group_id: string | null; id: string; kind: string; note: string | null;
          other_team_id: string | null; pick_id: string | null; player_id: string | null; salary: number | null; season: number; team_id: string; years: number | null;
        },
        {
          contract_id?: string | null; created_at?: string; group_id?: string | null; id?: string; kind: string; note?: string | null;
          other_team_id?: string | null; pick_id?: string | null; player_id?: string | null; salary?: number | null; season: number; team_id: string; years?: number | null;
        },
        [FK<"transactions_contract_id_fkey", "contract_id", "contracts">, FK<"transactions_other_team_id_fkey", "other_team_id", "teams">, FK<"transactions_pick_id_fkey", "pick_id", "draft_picks">, FK<"transactions_player_id_fkey", "player_id", "players">, FK<"transactions_team_id_fkey", "team_id", "teams">]
      >;
      waiver_bids: Table<
        { amount: number; created_at: string; drop_contract: string | null; id: string; team_id: string; waiver_id: string },
        { amount: number; created_at?: string; drop_contract?: string | null; id?: string; team_id: string; waiver_id: string },
        [FK<"waiver_bids_drop_contract_fkey", "drop_contract", "contracts">, FK<"waiver_bids_team_id_fkey", "team_id", "teams">, FK<"waiver_bids_waiver_id_fkey", "waiver_id", "waivers">]
      >;
      waivers: Table<
        {
          closed_at: string | null; closes_at: string; contract_id: string | null; created_at: string; dropped_by: string | null; id: string;
          note: string | null; player_id: string; season: number; status: string;
        },
        {
          closed_at?: string | null; closes_at: string; contract_id?: string | null; created_at?: string; dropped_by?: string | null; id?: string;
          note?: string | null; player_id: string; season: number; status?: string;
        },
        [FK<"waivers_contract_id_fkey", "contract_id", "contracts">, FK<"waivers_dropped_by_fkey", "dropped_by", "teams">, FK<"waivers_player_id_fkey", "player_id", "players">]
      >;
    };
    Views: {
      nba_teams: { Row: { abbr: string | null; id: string | null }; Relationships: [] };
      team_day_points: { Row: { day: string | null; pts: number | null; team_id: string | null }; Relationships: [FK<"lineup_points_team_id_fkey", "team_id", "teams">] };
    };
    Functions: {
      bidding_open: { Args: { p_round: string; p_opens: string; p_closes: string; p_settles: string }; Returns: boolean };
      bidding_place: { Args: { p_round: string; p_team: string; p_player: string; p_amount: number | null }; Returns: undefined };
      bidding_renounce: { Args: { p_bid: string; p_team: string; p_max: number }; Returns: undefined };
      bidding_restart: { Args: { p_season: number }; Returns: undefined };
      bidding_settle: { Args: { p_round: string; p_awards: Json; p_result: Json; p_renounces: number }; Returns: boolean };
      bidding_set_lengths: { Args: { p_team: string; p_season: number; p_rows: Json; p_limits: Json }; Returns: undefined };
      current_lineups: {
        Args: { p_teams: string[] | null; p_day: string };
        Returns: { day: string; player_id: string; saved_at: string; slot: string; team_id: string }[];
      };
      player_totals: {
        Args: { p_from: string; p_regular: boolean };
        Returns: { player_id: string; gp: number; min: number; pts: number; fgm: number; fga: number; reb: number; ast: number; stl: number; blk: number; tov: number; tf: number; ej: number; fpts: number }[];
      };
      extensions_decide: { Args: { p_team: string; p_season: number; p_rows: Json; p_note: string }; Returns: undefined };
      rescore_all: { Args: { w: Json }; Returns: undefined };
      roster_pickup: {
        Args: { p_team: string; p_player: string; p_salary: number; p_season: number; p_drop: string | null; p_note: string };
        Returns: string;
      };
      roster_release: { Args: { p_contract: string; p_note: string; p_season: number }; Returns: undefined };
      roster_sign: {
        Args: { p_note: string; p_player: string; p_salary: number; p_season: number; p_season_signed: number; p_team: string; p_via: string; p_years: number };
        Returns: string;
      };
      roster_trade: {
        Args: { p_from_a: string[]; p_from_b: string[]; p_note: string; p_season: number; p_team_a: string; p_team_b: string };
        Returns: string;
      };
      draft_picks_fill: { Args: { p_first: number; p_years: number }; Returns: undefined };
      rookie_lottery_save: { Args: { p_year: number; p_order: string[]; p_odds: Json }; Returns: boolean };
      rookie_pick: { Args: { p_year: number; p_team: string; p_player: string; p_salary: number; p_years: number; p_season: number; p_note: string }; Returns: number };
      trade_offer_accept: { Args: { p_offer: string; p_season: number }; Returns: undefined };
      save_lineup: { Args: { p_day: string; p_rows: Json; p_team: string }; Returns: undefined };
      score_lineup_points: { Args: { p_from: string; p_to: string }; Returns: undefined };
      snapshot_lineups: { Args: { p_day: string; p_rows: Json }; Returns: undefined };
      waiver_bid: { Args: { p_amount: number | null; p_drop: string | null; p_team: string; p_waiver: string }; Returns: undefined };
      waiver_settle: { Args: { p_bid: string | null; p_bids: number; p_note: string; p_season: number; p_waiver: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
