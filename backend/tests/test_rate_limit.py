from app.core.rate_limit import check_and_increment


class _FakeRedis:
    def __init__(self):
        self._sets: dict[str, list[tuple[int, str]]] = {}
        self._pending = []

    def pipeline(self):
        outer = self

        class _Pipe:
            def __init__(self):
                self.ops = []

            def zremrangebyscore(self, key, mn, mx):
                self.ops.append(("rem", key, mn, mx))
                return self

            def zadd(self, key, mapping):
                self.ops.append(("add", key, mapping))
                return self

            def zcard(self, key):
                self.ops.append(("card", key))
                return self

            def expire(self, key, secs):
                self.ops.append(("expire", key, secs))
                return self

            def execute(self):
                results = []
                for op in self.ops:
                    if op[0] == "rem":
                        _, key, mn, mx = op
                        bag = outer._sets.setdefault(key, [])
                        outer._sets[key] = [(s, m) for s, m in bag if s > mx]
                        results.append(0)
                    elif op[0] == "add":
                        _, key, mapping = op
                        bag = outer._sets.setdefault(key, [])
                        for member, score in mapping.items():
                            bag.append((score, member))
                        results.append(len(mapping))
                    elif op[0] == "card":
                        _, key = op
                        results.append(len(outer._sets.get(key, [])))
                    elif op[0] == "expire":
                        results.append(True)
                return results

        return _Pipe()


def test_allows_first_N_then_blocks():
    r = _FakeRedis()
    allowed = [
        check_and_increment(r, key="k", max_count=3, window_seconds=60)
        for _ in range(4)
    ]
    assert allowed == [True, True, True, False]


def test_fail_open_when_redis_none():
    assert check_and_increment(None, key="k", max_count=1, window_seconds=60) is True


def test_fail_open_on_redis_exception():
    class _Broken:
        def pipeline(self):
            raise RuntimeError("down")
    assert check_and_increment(_Broken(), key="k", max_count=1, window_seconds=60) is True
