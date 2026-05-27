from app.db.base import Base


def test_metadata_has_naming_convention():
    nc = Base.metadata.naming_convention
    assert nc["pk"] == "pk_%(table_name)s"
    assert "fk" in nc and "uq" in nc and "ix" in nc
