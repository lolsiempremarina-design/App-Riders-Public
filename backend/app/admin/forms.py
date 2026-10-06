from flask_wtf import FlaskForm
from wtforms import DateTimeLocalField, DecimalField, FloatField, IntegerField, SelectField, StringField, TextAreaField
from wtforms.validators import DataRequired, Length, NumberRange, Optional, Regexp

NOBODY = ''  # value of the rider list for "no rider": the order is offered to every rider


def rider_field(label):
    # choices filled by the view (riders that can take an order); the view also checks the chosen one,
    # since a disabled option (rider busy with another order) can still be sent by hand
    return SelectField(label, choices=[], validate_choice=False, default=NOBODY)


class _OrderFields(FlaskForm):
    restaurant_name = StringField('Locale / ristorante', validators=[DataRequired(), Length(max=150)])
    pickup_address = StringField('Indirizzo di ritiro', validators=[DataRequired(), Length(max=255)])
    delivery_address = StringField('Indirizzo di consegna', validators=[DataRequired(), Length(max=255)])
    customer_name = StringField('Cliente (facoltativo)', validators=[Optional(), Length(max=100)])
    items = TextAreaField('Contenuto (facoltativo)', validators=[Optional(), Length(max=500)])
    notes = TextAreaField('Note per il rider (facoltative)', validators=[Optional(), Length(max=500)])
    distance_km = FloatField('Distanza ritiro → consegna (km, facoltativa)', validators=[Optional(), NumberRange(min=0, max=200)])
    pay = DecimalField('Compenso (€)', places=2, validators=[DataRequired(), NumberRange(min=0, max=1000)])
    bonus = DecimalField('Bonus (€)', places=2, default=0, validators=[Optional(), NumberRange(min=0, max=1000)])


class OrderForm(_OrderFields):
    offer_minutes = IntegerField('Offerta valida per (minuti, vuoto = senza scadenza)',
                                 default=30, validators=[Optional(), NumberRange(min=1, max=24 * 60)])
    due_minutes = IntegerField('Consegna promessa entro (minuti, facoltativo)',
                               validators=[Optional(), NumberRange(min=5, max=24 * 60)])
    rider_id = rider_field('Assegna subito a (facoltativo)')


class OrderEditForm(_OrderFields):
    # local time (APP_TIMEZONE) like the rest of the panel; the browser sends it without seconds
    expires_at = DateTimeLocalField('Offerta valida fino a (vuoto = senza scadenza)', format='%Y-%m-%dT%H:%M',
                                    validators=[Optional()])
    due_at = DateTimeLocalField('Consegna promessa entro (facoltativo)', format='%Y-%m-%dT%H:%M',
                                validators=[Optional()])


class AssignForm(FlaskForm):
    rider_id = rider_field('Rider')


class BikeForm(FlaskForm):
    bike_id = StringField('Codice (es. 013-006; vuoto = generato)',
                          validators=[Optional(), Length(max=32), Regexp(r'^[A-Za-z0-9\-]+$', message='Solo lettere, numeri e trattini.')])
    label = StringField('Nome', validators=[DataRequired(), Length(max=120)])
    model = StringField('Modello', validators=[Optional(), Length(max=120)])
    location = StringField('Luogo', validators=[Optional(), Length(max=200)])
    description = StringField('Frase / descrizione', validators=[Optional(), Length(max=300)])
    history = TextAreaField('Storia (un evento per riga)', validators=[Optional(), Length(max=4000)])
    contact_phone = StringField('Telefono di riferimento (facoltativo)',
                                validators=[Optional(), Length(max=20), Regexp(r'^[\d\s+\-()]*$', message='Numero non valido.')])
