import pandas as pd
import yfinance as yf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense
from tensorflow.keras.optimizers import Adam
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler
import pickle

# Download historical data for AAPL from Yahoo Finance
data = yf.download('AAPL', start="2010-01-01", end="2022-01-01")

# Prepare the dataset
data['Tomorrow'] = data['Close'].shift(-1)
data = data.dropna()
X = data[['Open', 'High', 'Low', 'Close', 'Volume']]
y = data['Tomorrow']

# Scale the features
scaler = MinMaxScaler()
X_scaled = scaler.fit_transform(X)
y = y.values.reshape(-1, 1)
y_scaled = scaler.fit_transform(y)

# Split the data into training and test sets
X_train, X_test, y_train, y_test = train_test_split(X_scaled, y_scaled, test_size=0.2, random_state=42)

# Define a simple Deep Neural Network
model = Sequential([
    Dense(64, activation='relu', input_dim=X_train.shape[1]),
    Dense(64, activation='relu'),
    Dense(1)
])

# Compile the model
model.compile(optimizer=Adam(), loss='mean_squared_error')

# Train the model
model.fit(X_train, y_train, epochs=10, batch_size=32, validation_split=0.2)

# Save the model and scaler
model.save('AAPL_model.h5')
with open('scaler.pkl', 'wb') as f:
    pickle.dump(scaler, f)
