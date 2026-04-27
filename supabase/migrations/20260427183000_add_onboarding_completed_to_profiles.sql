ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

UPDATE public.profiles
SET onboarding_completed = false
WHERE onboarding_completed IS NULL;
