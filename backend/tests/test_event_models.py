def test_event_models_importable():
    from app.models import (
        Attachment, Event, EventCategory, EventCustomField,
        EventCustomFieldOption, EventVisibility,
    )

    assert Event.__tablename__ == "events"
    assert EventCategory.__tablename__ == "event_categories"
    assert EventCustomField.__tablename__ == "event_custom_fields"
    assert EventCustomFieldOption.__tablename__ == "event_custom_field_options"
    assert Attachment.__tablename__ == "attachments"
    assert EventVisibility.__tablename__ == "event_visibility"
    assert hasattr(Event, "status")
    assert hasattr(Event, "capacity")
    assert hasattr(Attachment, "stored_path")
