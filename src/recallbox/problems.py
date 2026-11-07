"""Safe public error metadata; never include SQL/exception text."""
class Problem(Exception):
    def __init__(self, status: int, code: str, **details):
        self.status, self.code, self.details = status, code, details
