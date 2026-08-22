"""Login and identity.

Only this module knows how a user proves who they are. `core/deps.get_current_user`
and the `require_roles` guards are written against the resulting token, so replacing
password login with the bank's SSO later touches nothing outside this package.
"""
