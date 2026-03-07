package com.zikr;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.Button;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ValueEventListener;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class SocialActivity extends AppCompatActivity {
    
    private RecyclerView recyclerView;
    private PostAdapter adapter;
    private List<Post> postList;
    private DatabaseReference mDatabase;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_social);

        // 🌟 1. Switch Back to Zikr App Button 🌟
        Button btnSwitch = findViewById(R.id.btnSwitchToZikr);
        btnSwitch.setOnClickListener(v -> {
            // Memory change karo wapas HOME pe
            getSharedPreferences("AppPrefs", MODE_PRIVATE).edit().putString("LastScreen", "HOME").apply();
            startActivity(new Intent(SocialActivity.this, MainActivity.class));
            finish(); // Social activity ko band kar do
        });

        // 🌟 2. RecyclerView Setup 🌟
        recyclerView = findViewById(R.id.recyclerViewSocial);
        recyclerView.setLayoutManager(new LinearLayoutManager(this));
        
        postList = new ArrayList<>();
        adapter = new PostAdapter(this, postList);
        recyclerView.setAdapter(adapter);

        // 🌟 3. Load Posts from Firebase 🌟
        mDatabase = FirebaseDatabase.getInstance().getReference("social_posts");
        
        mDatabase.addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                postList.clear(); // Purana data saaf karo
                
                if (snapshot.exists()) {
                    for (DataSnapshot postSnap : snapshot.getChildren()) {
                        // Data fetch karna
                        String title = postSnap.child("title").getValue(String.class);
                        String imageUrl = postSnap.child("imageUrl").getValue(String.class);
                        String htmlContent = postSnap.child("htmlContent").getValue(String.class);
                        
                        // List mein add karna
                        postList.add(new Post(title, imageUrl, htmlContent));
                    }
                    
                    // Nayi post upar dikhane ke liye list ko reverse karo
                    Collections.reverse(postList); 
                    
                    // Adapter ko batao ki naya data aa gaya hai
                    adapter.notifyDataSetChanged();
                } else {
                    Toast.makeText(SocialActivity.this, "No posts found", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                Toast.makeText(SocialActivity.this, "Failed to load feed", Toast.LENGTH_SHORT).show();
            }
        });
    }
}
