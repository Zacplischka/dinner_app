export type Profile = {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
    created_at: string;
    updated_at: string;
};
export type Friendship = {
    id: string;
    user_id: string;
    friend_id: string;
    status: 'pending' | 'accepted' | 'blocked';
    created_at: string;
    updated_at: string;
};
export type SessionInvite = {
    id: string;
    session_code: string;
    inviter_id: string;
    invitee_id: string;
    status: 'pending' | 'accepted' | 'declined' | 'expired';
    created_at: string;
};
export type FriendWithProfile = {
    friendship_id: string;
    friend_id: string;
    display_name: string;
    avatar_url: string | null;
    email: string | null;
    status: 'pending' | 'accepted' | 'blocked';
    created_at: string;
};
type ProfileInsert = {
    id: string;
    display_name?: string | null;
    avatar_url?: string | null;
    email?: string | null;
    created_at?: string;
    updated_at?: string;
};
type FriendshipInsert = {
    id?: string;
    user_id: string;
    friend_id: string;
    status: Friendship['status'];
    created_at?: string;
    updated_at?: string;
};
type SessionInviteInsert = {
    id?: string;
    session_code: string;
    inviter_id: string;
    invitee_id: string;
    status: SessionInvite['status'];
    created_at?: string;
};
export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: Profile;
                Insert: ProfileInsert;
                Update: Partial<ProfileInsert>;
                Relationships: [];
            };
            friendships: {
                Row: Friendship;
                Insert: FriendshipInsert;
                Update: Partial<FriendshipInsert>;
                Relationships: [];
            };
            session_invites: {
                Row: SessionInvite;
                Insert: SessionInviteInsert;
                Update: Partial<SessionInviteInsert>;
                Relationships: [];
            };
        };
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: Record<string, never>;
        CompositeTypes: Record<string, never>;
    };
}
export declare const supabase: import("@supabase/supabase-js").SupabaseClient<Database, "public", "public", {
    Tables: {
        profiles: {
            Row: Profile;
            Insert: ProfileInsert;
            Update: Partial<ProfileInsert>;
            Relationships: [];
        };
        friendships: {
            Row: Friendship;
            Insert: FriendshipInsert;
            Update: Partial<FriendshipInsert>;
            Relationships: [];
        };
        session_invites: {
            Row: SessionInvite;
            Insert: SessionInviteInsert;
            Update: Partial<SessionInviteInsert>;
            Relationships: [];
        };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
}, {
    PostgrestVersion: "12";
}>;
export {};
//# sourceMappingURL=supabase.d.ts.map