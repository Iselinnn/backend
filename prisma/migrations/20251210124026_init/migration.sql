-- CreateTable
CREATE TABLE "User" (
    "steamId" TEXT NOT NULL PRIMARY KEY,
    "avatar" TEXT,
    "name" TEXT,
    "tradeUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserInventory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userSteamId" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserInventory_userSteamId_fkey" FOREIGN KEY ("userSteamId") REFERENCES "User" ("steamId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemPriceHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "itemName" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "sourceMarket" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_steamId_key" ON "User"("steamId");

-- CreateIndex
CREATE UNIQUE INDEX "UserInventory_userSteamId_key" ON "UserInventory"("userSteamId");

-- CreateIndex
CREATE INDEX "ItemPriceHistory_itemName_idx" ON "ItemPriceHistory"("itemName");

-- CreateIndex
CREATE INDEX "ItemPriceHistory_timestamp_idx" ON "ItemPriceHistory"("timestamp");
