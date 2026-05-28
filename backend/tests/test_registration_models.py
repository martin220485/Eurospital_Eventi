def test_registration_models_importable():
    from app.models import Checkin, Registration, RegistrationCustomAnswer

    assert Registration.__tablename__ == "registrations"
    assert RegistrationCustomAnswer.__tablename__ == "registration_custom_answers"
    assert Checkin.__tablename__ == "checkins"
    assert hasattr(Registration, "status")
    assert hasattr(Registration, "waitlist_position")
    assert hasattr(Checkin, "checked_in_at")
