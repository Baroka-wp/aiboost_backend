-- CreateTable
CREATE TABLE "Survey" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "user_id" INTEGER,
    "learning_goal" TEXT NOT NULL,
    "motivation" TEXT NOT NULL,
    "skill_level" TEXT NOT NULL,
    "usage_goal" TEXT NOT NULL,
    "value_range" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
