IF DB_ID('SuggestIt') IS NULL
  CREATE DATABASE [SuggestIt];
GO

USE [SuggestIt];
GO

IF OBJECT_ID('dbo.AlchemyVotes', 'U') IS NOT NULL DROP TABLE dbo.AlchemyVotes;
IF OBJECT_ID('dbo.AlchemySourceIds', 'U') IS NOT NULL DROP TABLE dbo.AlchemySourceIds;
IF OBJECT_ID('dbo.SuggestionVotes', 'U') IS NOT NULL DROP TABLE dbo.SuggestionVotes;
IF OBJECT_ID('dbo.AlchemyResults', 'U') IS NOT NULL DROP TABLE dbo.AlchemyResults;
IF OBJECT_ID('dbo.Suggestions', 'U') IS NOT NULL DROP TABLE dbo.Suggestions;
IF OBJECT_ID('dbo.GroupMembers', 'U') IS NOT NULL DROP TABLE dbo.GroupMembers;
IF OBJECT_ID('dbo.Groups', 'U') IS NOT NULL DROP TABLE dbo.Groups;
IF OBJECT_ID('dbo.Users', 'U') IS NOT NULL DROP TABLE dbo.Users;
GO

CREATE TABLE dbo.Users (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  passwordHash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  avatarUrl VARCHAR(500) NULL,
  createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.Groups (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(MAX) NULL,
  inviteCode VARCHAR(10) NOT NULL UNIQUE,
  ownerId VARCHAR(36) NOT NULL,
  createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_Groups_Users_ownerId
    FOREIGN KEY (ownerId) REFERENCES dbo.Users(id) ON DELETE CASCADE
);

CREATE TABLE dbo.GroupMembers (
  userId VARCHAR(36) NOT NULL,
  groupId VARCHAR(36) NOT NULL,
  role VARCHAR(20) NOT NULL,
  joinedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_GroupMembers PRIMARY KEY (userId, groupId),
  CONSTRAINT CK_GroupMembers_role CHECK (role IN ('owner', 'admin', 'member')),
  CONSTRAINT FK_GroupMembers_Users_userId
    FOREIGN KEY (userId) REFERENCES dbo.Users(id) ON DELETE NO ACTION,
  CONSTRAINT FK_GroupMembers_Groups_groupId
    FOREIGN KEY (groupId) REFERENCES dbo.Groups(id) ON DELETE CASCADE
);

CREATE TABLE dbo.Suggestions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  groupId VARCHAR(36) NOT NULL,
  authorId VARCHAR(36) NOT NULL,
  title VARCHAR(100) NOT NULL,
  description VARCHAR(MAX) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_Suggestions_status CHECK (status IN ('open', 'under_review', 'accepted', 'rejected')),
  CONSTRAINT FK_Suggestions_Groups_groupId
    FOREIGN KEY (groupId) REFERENCES dbo.Groups(id) ON DELETE CASCADE,
  CONSTRAINT FK_Suggestions_Users_authorId
    FOREIGN KEY (authorId) REFERENCES dbo.Users(id) ON DELETE NO ACTION
);

CREATE TABLE dbo.SuggestionVotes (
  suggestionId VARCHAR(36) NOT NULL,
  userId VARCHAR(36) NOT NULL,
  vote VARCHAR(10) NOT NULL,
  CONSTRAINT PK_SuggestionVotes PRIMARY KEY (suggestionId, userId),
  CONSTRAINT CK_SuggestionVotes_vote CHECK (vote IN ('up', 'down')),
  CONSTRAINT FK_SuggestionVotes_Suggestions_suggestionId
    FOREIGN KEY (suggestionId) REFERENCES dbo.Suggestions(id) ON DELETE CASCADE,
  CONSTRAINT FK_SuggestionVotes_Users_userId
    FOREIGN KEY (userId) REFERENCES dbo.Users(id) ON DELETE NO ACTION
);

CREATE TABLE dbo.AlchemyResults (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  groupId VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description VARCHAR(MAX) NULL,
  depth INT NOT NULL DEFAULT 0,
  createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_AlchemyResults_Groups_groupId
    FOREIGN KEY (groupId) REFERENCES dbo.Groups(id) ON DELETE CASCADE
);

CREATE TABLE dbo.AlchemySourceIds (
  alchemyId VARCHAR(36) NOT NULL,
  sourceId VARCHAR(36) NOT NULL,
  position INT NOT NULL,
  CONSTRAINT PK_AlchemySourceIds PRIMARY KEY (alchemyId, position),
  CONSTRAINT CK_AlchemySourceIds_position CHECK (position IN (0, 1)),
  CONSTRAINT FK_AlchemySourceIds_AlchemyResults_alchemyId
    FOREIGN KEY (alchemyId) REFERENCES dbo.AlchemyResults(id) ON DELETE CASCADE
);

CREATE TABLE dbo.AlchemyVotes (
  alchemyId VARCHAR(36) NOT NULL,
  userId VARCHAR(36) NOT NULL,
  vote VARCHAR(10) NOT NULL,
  CONSTRAINT PK_AlchemyVotes PRIMARY KEY (alchemyId, userId),
  CONSTRAINT CK_AlchemyVotes_vote CHECK (vote IN ('up', 'down')),
  CONSTRAINT FK_AlchemyVotes_AlchemyResults_alchemyId
    FOREIGN KEY (alchemyId) REFERENCES dbo.AlchemyResults(id) ON DELETE CASCADE,
  CONSTRAINT FK_AlchemyVotes_Users_userId
    FOREIGN KEY (userId) REFERENCES dbo.Users(id) ON DELETE NO ACTION
);
GO

CREATE INDEX IX_Groups_createdAt ON dbo.Groups(createdAt DESC);
CREATE INDEX IX_GroupMembers_groupId ON dbo.GroupMembers(groupId);
CREATE INDEX IX_Suggestions_groupId_createdAt ON dbo.Suggestions(groupId, createdAt DESC);
CREATE INDEX IX_SuggestionVotes_suggestionId ON dbo.SuggestionVotes(suggestionId);
CREATE INDEX IX_AlchemyResults_groupId_createdAt ON dbo.AlchemyResults(groupId, createdAt DESC);
GO

INSERT INTO dbo.Users (id, username, passwordHash, name, email, avatarUrl, createdAt) VALUES
('admin_0001', 'admin', '$2b$10$k2WH1YhNPiIDlGRpTZx.i.k1qz5H7QM1KLfKVKS.3dJgG0QgaKHqe', 'Admin User', 'simonlacika1234@gmail.com', 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin_0001', SYSUTCDATETIME()),
('user_0000', 'user', '$2b$10$k2WH1YhNPiIDlGRpTZx.i.k1qz5H7QM1KLfKVKS.3dJgG0QgaKHqe', 'Demo User', 'simonlacika1234onedrive@gmail.com', 'https://api.dicebear.com/7.x/avataaars/svg?seed=user_0000', SYSUTCDATETIME()),
('user_0001', 'alex_morgan', '$2b$10$k2WH1YhNPiIDlGRpTZx.i.k1qz5H7QM1KLfKVKS.3dJgG0QgaKHqe', 'Alex Morgan', 'alex.morgan@example.com', 'https://api.dicebear.com/7.x/avataaars/svg?seed=user_0001', DATEADD(day, -30, SYSUTCDATETIME())),
('user_0002', 'jordan_lee', '$2b$10$k2WH1YhNPiIDlGRpTZx.i.k1qz5H7QM1KLfKVKS.3dJgG0QgaKHqe', 'Jordan Lee', 'jordan.lee@example.com', 'https://api.dicebear.com/7.x/avataaars/svg?seed=user_0002', DATEADD(day, -25, SYSUTCDATETIME())),
('user_0003', 'sam_rivera', '$2b$10$k2WH1YhNPiIDlGRpTZx.i.k1qz5H7QM1KLfKVKS.3dJgG0QgaKHqe', 'Sam Rivera', 'sam.rivera@example.com', 'https://api.dicebear.com/7.x/avataaars/svg?seed=user_0003', DATEADD(day, -22, SYSUTCDATETIME())),
('user_0004', 'casey_kim', '$2b$10$k2WH1YhNPiIDlGRpTZx.i.k1qz5H7QM1KLfKVKS.3dJgG0QgaKHqe', 'Casey Kim', 'casey.kim@example.com', 'https://api.dicebear.com/7.x/avataaars/svg?seed=user_0004', DATEADD(day, -20, SYSUTCDATETIME())),
('user_0005', 'riley_patel', '$2b$10$k2WH1YhNPiIDlGRpTZx.i.k1qz5H7QM1KLfKVKS.3dJgG0QgaKHqe', 'Riley Patel', 'riley.patel@example.com', 'https://api.dicebear.com/7.x/avataaars/svg?seed=user_0005', DATEADD(day, -18, SYSUTCDATETIME()));

INSERT INTO dbo.Groups (id, name, description, inviteCode, ownerId, createdAt) VALUES
('group_0001', 'Product Team', 'Share ideas to improve our core product. All feedback welcome - big or small.', 'PROD01', 'user_0001', DATEADD(day, -20, SYSUTCDATETIME())),
('group_0002', 'Office Vibes', 'Suggestions for making the office a better place to work.', 'OFFICE', 'user_0001', DATEADD(day, -17, SYSUTCDATETIME())),
('group_0003', 'Tech Stack Debates', 'Propose and vote on new tools, libraries, and architectural decisions.', 'TECH03', 'user_0002', DATEADD(day, -14, SYSUTCDATETIME()));

INSERT INTO dbo.GroupMembers (userId, groupId, role, joinedAt) VALUES
('admin_0001', 'group_0001', 'owner', DATEADD(day, -20, SYSUTCDATETIME())),
('user_0001', 'group_0001', 'admin', DATEADD(day, -19, SYSUTCDATETIME())),
('user_0002', 'group_0001', 'member', DATEADD(day, -18, SYSUTCDATETIME())),
('user_0003', 'group_0001', 'member', DATEADD(day, -17, SYSUTCDATETIME())),
('admin_0001', 'group_0002', 'owner', DATEADD(day, -17, SYSUTCDATETIME())),
('user_0002', 'group_0002', 'member', DATEADD(day, -16, SYSUTCDATETIME())),
('user_0004', 'group_0002', 'member', DATEADD(day, -15, SYSUTCDATETIME())),
('user_0001', 'group_0003', 'owner', DATEADD(day, -14, SYSUTCDATETIME())),
('admin_0001', 'group_0003', 'admin', DATEADD(day, -13, SYSUTCDATETIME())),
('user_0003', 'group_0003', 'member', DATEADD(day, -12, SYSUTCDATETIME()));

INSERT INTO dbo.Suggestions (id, groupId, authorId, title, description, status, createdAt, updatedAt) VALUES
('sug_0001', 'group_0001', 'user_0001', 'Dark mode for the dashboard', 'A proper dark mode would reduce eye strain for late work and can follow the operating system preference.', 'open', DATEADD(day, -9, SYSUTCDATETIME()), DATEADD(day, -9, SYSUTCDATETIME())),
('sug_0002', 'group_0001', 'user_0002', 'Keyboard shortcut cheatsheet', 'Add a modal triggered from the UI that shows available shortcuts and improves discoverability.', 'under_review', DATEADD(day, -7, SYSUTCDATETIME()), DATEADD(day, -3, SYSUTCDATETIME())),
('sug_0003', 'group_0001', 'admin_0001', 'Bulk export to CSV', 'Power users need to export data regularly instead of copying rows manually.', 'accepted', DATEADD(day, -5, SYSUTCDATETIME()), DATEADD(day, -2, SYSUTCDATETIME())),
('sug_0004', 'group_0002', 'user_0004', 'Standing desks in the main room', 'A few height-adjustable desks would help people who have back pain during long sessions.', 'open', DATEADD(day, -8, SYSUTCDATETIME()), DATEADD(day, -8, SYSUTCDATETIME())),
('sug_0005', 'group_0002', 'user_0002', 'Silent focus hours', 'Reserve two hours each morning as no-meeting and no-loud-calls time.', 'open', DATEADD(day, -6, SYSUTCDATETIME()), DATEADD(day, -6, SYSUTCDATETIME())),
('sug_0006', 'group_0003', 'user_0001', 'Adopt Zod for runtime validation', 'Runtime validation at API boundaries would catch invalid data before it reaches the UI.', 'accepted', DATEADD(day, -4, SYSUTCDATETIME()), DATEADD(day, -1, SYSUTCDATETIME()));

INSERT INTO dbo.SuggestionVotes (suggestionId, userId, vote) VALUES
('sug_0001', 'admin_0001', 'up'),
('sug_0001', 'user_0002', 'up'),
('sug_0001', 'user_0003', 'down'),
('sug_0002', 'admin_0001', 'up'),
('sug_0002', 'user_0003', 'up'),
('sug_0003', 'user_0001', 'up'),
('sug_0003', 'user_0002', 'up'),
('sug_0004', 'admin_0001', 'up'),
('sug_0005', 'user_0004', 'down'),
('sug_0006', 'admin_0001', 'up'),
('sug_0006', 'user_0003', 'up');

INSERT INTO dbo.AlchemyResults (id, groupId, title, description, depth, createdAt) VALUES
('alch_0001', 'group_0001', 'Dark mode for the dashboard + Keyboard shortcut cheatsheet', 'A focused accessibility and power-user improvement bundle for dashboard users.', 0, DATEADD(day, -2, SYSUTCDATETIME()));

INSERT INTO dbo.AlchemySourceIds (alchemyId, sourceId, position) VALUES
('alch_0001', 'sug_0001', 0),
('alch_0001', 'sug_0002', 1);

INSERT INTO dbo.AlchemyVotes (alchemyId, userId, vote) VALUES
('alch_0001', 'admin_0001', 'up'),
('alch_0001', 'user_0002', 'up');
GO
