# Frontend - WhatsApp CRM Dashboard

This is the frontend dashboard for the Tutorsolve WhatsApp CRM. It is a modern React application built using **Next.js** (App Router) and styled with **Tailwind CSS v4**.

## 🛠 Prerequisites
- Node.js 18+
- `pnpm` (Fast, disk space efficient package manager)

## ⚙️ Setup & Installation

1. **Install Dependencies:**
   ```bash
   pnpm install
   ```

2. **Environment Configuration:**
   Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```
   Ensure `NEXT_PUBLIC_API_URL` points to your running Flask backend (usually `http://localhost:5000`).

3. **Run the Development Server:**
   ```bash
   pnpm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🧪 Running Tests
This project uses **Jest** alongside **React Testing Library** for integration testing.

```bash
pnpm test
```

## 📁 Architecture
- `src/app/`: Next.js file-based routing directory (Pages, Layouts).
- `src/components/`: Reusable, generic UI components (Buttons, Inputs, Modals).
- `src/lib/`: Helper functions and configuration singletons.
- `src/middleware.ts`: Next.js edge middleware utilized for strictly enforcing route protection against unauthenticated access.
