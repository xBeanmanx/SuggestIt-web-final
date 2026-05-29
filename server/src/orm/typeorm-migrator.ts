import { createTypeOrmDataSource } from "./typeorm-schemas.js";
import type { MSSQLConfig } from "../mssql-store.js";

export async function migrateWithTypeOrm(config: MSSQLConfig): Promise<void> {
  const dataSource = createTypeOrmDataSource(config);
  await dataSource.initialize();

  try {
    await seedRolePermissionInfrastructure(dataSource.query.bind(dataSource));
  } finally {
    await dataSource.destroy();
  }
}

async function seedRolePermissionInfrastructure(
  query: (sql: string) => Promise<unknown>
): Promise<void> {
  await query(`
    MERGE Roles AS target
    USING (VALUES
      ('role_admin', 'ADMIN', 'Full administrative access'),
      ('role_user', 'USER', 'Restricted regular user access')
    ) AS source (id, name, description)
    ON target.id = source.id
    WHEN MATCHED THEN UPDATE SET name = source.name, description = source.description
    WHEN NOT MATCHED THEN INSERT (id, name, description) VALUES (source.id, source.name, source.description);
  `);

  await query(`
    MERGE Permissions AS target
    USING (VALUES
      ('perm_read', 'READ_DOMAIN', 'Read users, groups, suggestions and statistics'),
      ('perm_write_own', 'WRITE_OWN_SUGGESTIONS', 'Create and update own suggestions'),
      ('perm_admin', 'ADMINISTER_DOMAIN', 'Manage groups, users and moderation'),
      ('perm_view_logs', 'VIEW_SECURITY_LOGS', 'View action logs and observation list')
    ) AS source (id, code, description)
    ON target.id = source.id
    WHEN MATCHED THEN UPDATE SET code = source.code, description = source.description
    WHEN NOT MATCHED THEN INSERT (id, code, description) VALUES (source.id, source.code, source.description);
  `);

  await query(`
    MERGE RolePermissions AS target
    USING (VALUES
      ('role_admin', 'perm_read'),
      ('role_admin', 'perm_write_own'),
      ('role_admin', 'perm_admin'),
      ('role_admin', 'perm_view_logs'),
      ('role_user', 'perm_read'),
      ('role_user', 'perm_write_own')
    ) AS source (roleId, permissionId)
    ON target.roleId = source.roleId AND target.permissionId = source.permissionId
    WHEN NOT MATCHED THEN INSERT (roleId, permissionId) VALUES (source.roleId, source.permissionId);
  `);
}
