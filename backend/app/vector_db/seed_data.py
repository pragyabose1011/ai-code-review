"""Seed ChromaDB with coding best practices, OWASP rules, and language-specific docs."""
from app.vector_db.client import get_collection


BEST_PRACTICES = [
    # OWASP Security Rules
    {
        "id": "owasp-1",
        "text": "SQL Injection Prevention: Never concatenate user input into SQL queries. Use parameterized queries or prepared statements. Example of vulnerable code: query = 'SELECT * FROM users WHERE id = ' + user_id. Use instead: cursor.execute('SELECT * FROM users WHERE id = %s', (user_id,))",
        "category": "security",
        "source": "OWASP A03:2021"
    },
    {
        "id": "owasp-2",
        "text": "XSS Prevention: Always sanitize and escape user-supplied data before rendering in HTML. Use Content Security Policy headers. Never use innerHTML with user data. Prefer textContent over innerHTML.",
        "category": "security",
        "source": "OWASP A03:2021"
    },
    {
        "id": "owasp-3",
        "text": "Hardcoded Secrets: Never hardcode passwords, API keys, tokens, or credentials in source code. Use environment variables or secret management services. Patterns to avoid: password='secret123', api_key='sk-...', SECRET_KEY='hardcoded'",
        "category": "security",
        "source": "OWASP A02:2021"
    },
    {
        "id": "owasp-4",
        "text": "Insecure Deserialization: Avoid deserializing untrusted data using pickle, yaml.load (use yaml.safe_load), eval(), or exec(). These can lead to remote code execution.",
        "category": "security",
        "source": "OWASP A08:2021"
    },
    {
        "id": "owasp-5",
        "text": "Path Traversal: Validate and sanitize file paths. Never directly use user input in file operations. Use os.path.basename() and validate paths are within allowed directories.",
        "category": "security",
        "source": "OWASP A01:2021"
    },
    {
        "id": "owasp-6",
        "text": "Broken Authentication: Implement proper session management. Use secure, HttpOnly cookies. Implement multi-factor authentication. Avoid weak password policies. Use bcrypt or argon2 for password hashing.",
        "category": "security",
        "source": "OWASP A07:2021"
    },
    {
        "id": "owasp-7",
        "text": "SSRF Prevention: Validate and whitelist URLs before making server-side requests. Block requests to internal IP ranges (127.0.0.1, 169.254.0.0/16, 10.0.0.0/8). Use allowlist-based URL validation.",
        "category": "security",
        "source": "OWASP A10:2021"
    },
    {
        "id": "owasp-8",
        "text": "Command Injection: Never pass user input to shell commands. Use subprocess with a list of arguments (not shell=True). Avoid os.system(), os.popen() with user input.",
        "category": "security",
        "source": "OWASP A03:2021"
    },
    # Python Best Practices
    {
        "id": "py-1",
        "text": "Python Exception Handling: Avoid bare except clauses. Catch specific exceptions. Never silence exceptions with pass. Log exceptions properly. Use finally for cleanup.",
        "category": "quality",
        "source": "Python Best Practices"
    },
    {
        "id": "py-2",
        "text": "Python Mutable Default Arguments: Never use mutable objects as default arguments in functions. def foo(x, data=[]): is a bug. Use def foo(x, data=None): and set data = data or [] inside the function.",
        "category": "quality",
        "source": "Python Best Practices"
    },
    {
        "id": "py-3",
        "text": "Python Type Hints: Add type hints to function signatures for better code documentation and IDE support. Use Optional[T] for values that can be None. Import from typing module.",
        "category": "quality",
        "source": "Python Best Practices"
    },
    {
        "id": "py-4",
        "text": "Python Resource Management: Always use context managers (with statements) for file operations, database connections, and network connections. This ensures proper cleanup even when exceptions occur.",
        "category": "quality",
        "source": "Python Best Practices"
    },
    # JavaScript/TypeScript Best Practices
    {
        "id": "js-1",
        "text": "JavaScript Async/Await: Always handle promise rejections. Use try/catch with async/await. Add .catch() to promise chains. Unhandled promise rejections can crash Node.js processes.",
        "category": "quality",
        "source": "JavaScript Best Practices"
    },
    {
        "id": "js-2",
        "text": "JavaScript Memory Leaks: Remove event listeners when components unmount. Clear intervals and timeouts. Avoid storing large objects in closures. Use WeakMap/WeakSet for object references.",
        "category": "quality",
        "source": "JavaScript Best Practices"
    },
    {
        "id": "js-3",
        "text": "TypeScript Strict Mode: Enable strict mode in tsconfig. Avoid using 'any' type. Use unknown instead of any for truly unknown types. This catches runtime errors at compile time.",
        "category": "quality",
        "source": "TypeScript Best Practices"
    },
    # Code Quality
    {
        "id": "quality-1",
        "text": "Function Complexity: Functions should do one thing (Single Responsibility Principle). If a function is longer than 20-30 lines or has cyclomatic complexity > 10, consider refactoring into smaller functions.",
        "category": "quality",
        "source": "Clean Code"
    },
    {
        "id": "quality-2",
        "text": "Magic Numbers: Avoid magic numbers in code. Replace numeric literals with named constants. Example: if status == 404 should be if status == HTTP_NOT_FOUND. Improves readability and maintainability.",
        "category": "quality",
        "source": "Clean Code"
    },
    {
        "id": "quality-3",
        "text": "Naming Conventions: Use descriptive, intention-revealing names. Avoid abbreviations. Functions should be verbs (getUserById, calculateTotal). Classes should be nouns. Boolean variables should use is/has/can prefix.",
        "category": "quality",
        "source": "Clean Code"
    },
    {
        "id": "quality-4",
        "text": "DRY Principle (Don't Repeat Yourself): Code duplication is a code smell. Extract repeated logic into functions or classes. Each piece of knowledge must have a single, unambiguous, authoritative representation.",
        "category": "quality",
        "source": "Clean Code"
    },
    {
        "id": "quality-5",
        "text": "Error Handling: Handle errors at the right level of abstraction. Don't swallow errors. Provide meaningful error messages with context. Distinguish between expected errors and programming errors.",
        "category": "quality",
        "source": "Clean Code"
    },
    # Security Patterns
    {
        "id": "sec-1",
        "text": "JWT Security: Validate JWT signature and expiration. Never store sensitive data in JWT payload (it's base64 encoded, not encrypted). Use short expiration times. Implement token refresh.",
        "category": "security",
        "source": "JWT Best Practices"
    },
    {
        "id": "sec-2",
        "text": "CORS Configuration: Don't use wildcard (*) CORS in production. Specify exact allowed origins. Be careful with Access-Control-Allow-Credentials with wildcard origins.",
        "category": "security",
        "source": "Web Security"
    },
    {
        "id": "sec-3",
        "text": "Rate Limiting: Implement rate limiting on authentication endpoints and APIs to prevent brute force attacks and DoS. Use sliding window or token bucket algorithms.",
        "category": "security",
        "source": "API Security"
    },
    {
        "id": "sec-4",
        "text": "Cryptography: Never implement custom cryptography. Use established libraries. Use secure random number generators (secrets module in Python, crypto.randomBytes in Node.js). Avoid MD5/SHA1 for security purposes.",
        "category": "security",
        "source": "Cryptography Best Practices"
    },
]


def seed_vector_db():
    """Seed the ChromaDB collection with best practices data."""
    collection = get_collection()

    existing = collection.count()
    if existing >= len(BEST_PRACTICES):
        return {"status": "already_seeded", "count": existing}

    documents = [p["text"] for p in BEST_PRACTICES]
    ids = [p["id"] for p in BEST_PRACTICES]
    metadatas = [{"category": p["category"], "source": p["source"]} for p in BEST_PRACTICES]

    collection.upsert(documents=documents, ids=ids, metadatas=metadatas)
    return {"status": "seeded", "count": len(BEST_PRACTICES)}
