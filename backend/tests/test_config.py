from app.core.config import Settings


def test_sqlalchemy_url_built_from_components():
    s = Settings(
        mysql_host="db",
        mysql_port=3306,
        mysql_db="eventi",
        mysql_user="u",
        mysql_password="p",
        database_url=None,
    )
    assert s.sqlalchemy_url == "mysql+pymysql://u:p@db:3306/eventi"


def test_explicit_database_url_overrides_components():
    s = Settings(database_url="mysql+pymysql://x:y@h:3306/d")
    assert s.sqlalchemy_url == "mysql+pymysql://x:y@h:3306/d"
