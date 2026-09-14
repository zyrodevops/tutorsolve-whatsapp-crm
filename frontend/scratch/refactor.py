import os
import re

app_dir = "src/app/(app)"

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # If AppShell is not imported, skip
    if "AppShell" not in content:
        return

    # Replace import AppShell... with import { useAuth } from '@/context/AuthContext';
    # Or just add it if needed
    content = re.sub(r"import\s+AppShell\s+from\s+['\"]@/components/layout/AppShell['\"];?\n?", "", content)
    
    # Add useAuth import if not present
    if "useAuth" not in content:
        content = "import { useAuth } from '@/context/AuthContext';\n" + content

    # Dashboard page has a slightly different structure:
    # export default function DashboardPage() {
    #   return (
    #     <InboxProvider>
    #       <AppShell>
    #         {(user: CurrentUser) => <InboxContent currentUser={user} />}
    #       </AppShell>
    #     </InboxProvider>
    #   );
    # }
    if "DashboardPage" in content:
        content = re.sub(
            r"<AppShell>\s*\{\(user:\s*CurrentUser\)\s*=>\s*<InboxContent\s*currentUser=\{user\}\s*/>\}\s*</AppShell>",
            r"<InboxContentWrapper />",
            content
        )
        wrapper = """
function InboxContentWrapper() {
  const { user } = useAuth();
  if (!user) return null;
  return <InboxContent currentUser={user} />;
}
"""
        content += wrapper
    else:
        # For admin pages
        # export default function AnalyticsPage() {
        #   return (
        #     <AppShell>
        #       {(user: CurrentUser) => (user.role === 'ADMIN' ? <AnalyticsContent /> : <NotAuthorized />)}
        #     </AppShell>
        #   );
        # }
        pattern = re.compile(r"export\s+default\s+function\s+(\w+)\(\)\s*\{\s*return\s*\(\s*<AppShell>\s*\{\(user:\s*CurrentUser\)\s*=>\s*\((.*?)\)\}\s*</AppShell>\s*\);\s*\}", re.DOTALL)
        
        def replace_admin(match):
            func_name = match.group(1)
            inner_expr = match.group(2)
            return f"""export default function {func_name}() {{
  const {{ user }} = useAuth();
  if (!user) return null;
  return {inner_expr};
}}"""
        content = pattern.sub(replace_admin, content)
        
        # Second pattern without outer parens on the lambda body
        pattern2 = re.compile(r"export\s+default\s+function\s+(\w+)\(\)\s*\{\s*return\s*\(\s*<AppShell>\s*\{\(user:\s*CurrentUser\)\s*=>\s*([^<]*<.*?>[^}]*)\}\s*</AppShell>\s*\);\s*\}", re.DOTALL)
        content = pattern2.sub(replace_admin, content)

    with open(filepath, 'w') as f:
        f.write(content)

for root, _, files in os.walk(app_dir):
    for file in files:
        if file.endswith("page.tsx"):
            process_file(os.path.join(root, file))
