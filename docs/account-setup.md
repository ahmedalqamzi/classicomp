# Classicomp accounts (Supabase)

Classicomp works fully offline. Connecting a Supabase project adds real
accounts, a synced wishlist, and a friends list.

## 1. Create the project

Create a free project at https://supabase.com. From **Project Settings → API**
copy the **Project URL** and the **anon public key** — the app asks for both in
its sign-in dialog ("Connect your Supabase project").

## 2. Run this SQL (SQL editor → New query)

```sql
create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  display_name text
);

create table wishlists (
  user_id uuid references auth.users (id) on delete cascade,
  game_key text not null,
  primary key (user_id, game_key)
);

create table friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  unique (requester_id, addressee_id)
);

alter table profiles enable row level security;
alter table wishlists enable row level security;
alter table friendships enable row level security;

create policy "profiles are readable by signed-in users"
  on profiles for select to authenticated using (true);
create policy "users manage their own profile"
  on profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users manage their own wishlist"
  on wishlists for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users see friendships they are part of"
  on friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "users create their own requests"
  on friendships for insert to authenticated
  with check (requester_id = auth.uid());
create policy "addressees accept requests"
  on friendships for update to authenticated
  using (addressee_id = auth.uid());
```

## 3. Sign in

In Classicomp: account menu → **Sign in** → paste the URL and anon key once,
then create an account with email + password. The wishlist syncs on every
change while signed in; friends are added by their account email.
