  # 📄 PRD: Lean Authentication (Admin + User Only)

## 1. Overview
We need a **minimal authentication system** for the Varys AI MVP.  
It should support **admin-controlled invites** and two roles: `admin` and `user`.  
We’ll use **Supabase Auth** for email+password login and a simple `profiles` table for roles.

---

## 2. Goals
- Admins invite new users by email.  
- Users accept invite, set password, and log in.  
- Only two roles: `admin` and `user`.  
- Keep it as lean as possible.

---

## 3. User Roles
- **Admin**  
  - Can invite/manage users.  
  - Can assign roles.  
- **User**  
  - Can log in after invite.  
  - No user management powers.  

---

## 4. User Flow
1. Admin logs into portal → enters email → clicks **Invite User**.  
2. Supabase sends email invite with signup link.  
3. User accepts invite → sets password.  
4. User logs in with email+password.  
5. Role defaults to `user` (can be promoted to `admin` by an existing admin).  

---

## 5. Database Schema
Supabase manages `auth.users`. Add a `profiles` table:  

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text check (role in ('admin','user')) default 'user',
  created_at timestamp default now()
);
```

---

## 6. RLS Policies
Enable Row-Level Security:  

```sql
-- Users can see their own profile
create policy "Users can view own profile"
on profiles for select
using (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile"
on profiles for update
using (auth.uid() = id);
```

(For MVP, admins can manage roles directly from Supabase dashboard or via service role.)  

---

## 7. Features
- ✅ Email+password login (Supabase Auth).  
- ✅ Invite flow via Supabase admin API.  
- ✅ Password reset emails.  
- ✅ Role tracking in `profiles`.  

---

## 8. Non-Goals (Future)
- Organizations / tenants.  
- Vaults, workspaces, file permissions.  
- MFA, SSO, or social logins.  
- Audit logging.  

---

## 9. Tech Stack
- **Frontend**: Next.js + Supabase SDK.  
- **Backend/DB**: Supabase Auth + Postgres.  
- **Email**: Supabase SMTP or custom SMTP (Resend/Postmark).  

---

## 10. Admin Bootstrapping
**First Admin Setup** (Manual):
1. Navigate to Supabase Dashboard → Authentication → Users
2. Click **"Add user"** → enter admin email + password
3. Copy the user UUID
4. Navigate to SQL Editor → run:
   ```sql
   insert into profiles (id, email, role)
   values ('<user-uuid>', 'admin@example.com', 'admin');
   ```
