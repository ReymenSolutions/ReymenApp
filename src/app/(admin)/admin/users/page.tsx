import { getServerT } from "@/lib/i18n-server";
import { getAllUsers, getOrgOptions } from "@/actions/admin/users";
import { PageHeader } from "@/components/shared/PageHeader";
import { AdminUsersDirectory } from "@/components/admin/AdminUsersDirectory";

export default async function AdminUsersPage() {
  const [t, users, orgs] = await Promise.all([getServerT(), getAllUsers(), getOrgOptions()]);

  return (
    <div>
      <PageHeader
        title={t.adminNavUsers}
        description={`${users.length} ${t.adminUsersRegistered}`}
      />
      <AdminUsersDirectory
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          organizationId: u.organizationId,
          organizationName: u.organization?.name ?? null,
        }))}
        orgs={orgs}
      />
    </div>
  );
}
