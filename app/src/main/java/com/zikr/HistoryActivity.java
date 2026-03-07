package com.zikr;

import android.os.Bundle;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ValueEventListener;

public class HistoryActivity extends AppCompatActivity {

    private TextView tvHistoryTitle, tvHistoryStory;
    private DatabaseReference mDatabase;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_history);

        tvHistoryTitle = findViewById(R.id.tvHistoryTitle);
        tvHistoryStory = findViewById(R.id.tvHistoryStory);

        // Firebase reference for History
        mDatabase = FirebaseDatabase.getInstance().getReference("app_settings/history");

        mDatabase.addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                if (snapshot.exists()) {
                    String title = snapshot.child("title").getValue(String.class);
                    String story = snapshot.child("story").getValue(String.class);
                    
                    if(title != null) tvHistoryTitle.setText(title);
                    if(story != null) tvHistoryStory.setText(story);
                } else {
                    tvHistoryTitle.setText("Hazrat Yusuf (AS)");
                    tvHistoryStory.setText("Default offline story yahan aayegi...");
                }
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                tvHistoryStory.setText("Data load karne mein error aayi.");
            }
        });
    }
}
