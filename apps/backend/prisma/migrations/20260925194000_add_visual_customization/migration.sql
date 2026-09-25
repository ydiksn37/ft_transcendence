CREATE TYPE "DisplayTheme" AS ENUM ('CYBER', 'ARCADE', 'MONO');
CREATE TYPE "MapStyle" AS ENUM ('GRID', 'VOID', 'ARENA');
CREATE TYPE "BackgroundStyle" AS ENUM ('MATRIX', 'STARS', 'SOLID');

ALTER TABLE "UserGameSettings"
ADD COLUMN "displayTheme" "DisplayTheme" NOT NULL DEFAULT 'CYBER',
ADD COLUMN "mapStyle" "MapStyle" NOT NULL DEFAULT 'GRID',
ADD COLUMN "backgroundStyle" "BackgroundStyle" NOT NULL DEFAULT 'MATRIX';
